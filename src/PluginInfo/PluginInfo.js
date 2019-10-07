/**
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.
*/

/*
A class for holidng the information currently stored in plugin.xml
It should also be able to answer questions like whether the plugin
is compatible with a given engine version.

TODO (kamrik): refactor this to not use sync functions and return promises.
*/

const path = require('path');
const fs = require('fs-extra');
const xml_helpers = require('../util/xml-helpers');
const CordovaError = require('../CordovaError/CordovaError');

class PluginInfo {
    constructor (dirname) {
        this.filepath = path.join(dirname, 'plugin.xml');

        if (!fs.existsSync(this.filepath)) throw new CordovaError(`Cannot find plugin.xml for plugin "${path.basename(dirname)}". Please try adding it again.`);

        this.dir = dirname;

        const et = this._et = xml_helpers.parseElementtreeSync(this.filepath);
        const pelem = et.getroot();

        this.id = pelem.attrib.id;
        this.version = pelem.attrib.version;

        // Optional fields
        this.name = pelem.findtext('name');
        this.description = pelem.findtext('description');
        this.license = pelem.findtext('license');
        this.repo = pelem.findtext('repo');
        this.issue = pelem.findtext('issue');
        this.keywords = pelem.findtext('keywords');
        this.info = pelem.findtext('info');

        if (this.keywords) {
            this.keywords = this.keywords.split(',').map(s => s.trim());
        }

        this.getKeywordsAndPlatforms = () => (this.keywords || [])
            .concat('ecosystem:cordova')
            .concat(addCordova(this.getPlatformsArray()));
    }

    /**
     * <preference> tag
     * Example: <preference name="API_KEY" />
     * Used to require a variable to be specified via --variable when installing the plugin.
     *
     * @return {Object} { key : default | null}
    */
    getPreferences (platform) {
        return _getTags(this._et, 'preference', platform, prefTag => ({
            preference: prefTag.attrib.name.toUpperCase(),
            default: prefTag.attrib.default || null
        }))
            .reduce((preferences, pref) => {
                preferences[pref.preference] = pref.default;
                return preferences;
            }, {});
    }

    /**
     * <asset>
     */
    getAssets (platform) {
        return _getTags(this._et, 'asset', platform, tag => {
            const src = tag.attrib.src;
            const target = tag.attrib.target;

            if (!src || !target) throw new Error(`Malformed <asset> tag. Both "src" and "target" attributes must be specified in: ${this.filepath}`);

            return { itemType: 'asset', src, target };
        });
    }

    // <dependency>
    // Example:
    // <dependency id="com.plugin.id"
    //     url="https://github.com/myuser/someplugin"
    //     commit="428931ada3891801"
    //     subdir="some/path/here" />
    /**
     * <dependency>
     * Example:
     * <dependency id="com.plugin.id"
     *  url="https://github.com/myuser/someplugin"
     *  commit="428931ada3891801"
     *  subdir="some/path/here" />
     *
     * @param {*} platform
     */
    getDependencies (platform) {
        return _getTags(this._et, 'dependency', platform, tag => {
            if (!tag.attrib.id) throw new CordovaError(`<dependency> tag is missing id attribute in ${this.filepath}`);

            return {
                id: tag.attrib.id,
                version: tag.attrib.version || '',
                url: tag.attrib.url || '',
                subdir: tag.attrib.subdir || '',
                commit: tag.attrib.commit,
                git_ref: tag.attrib.commit
            };
        });
    }

    /**
     * <config-file> tag
     */
    getConfigFiles (platform) {
        return _getTags(this._et, 'config-file', platform, tag => ({
            target: tag.attrib.target,
            parent: tag.attrib.parent,
            after: tag.attrib.after,
            xmls: tag.getchildren(),
            // To support demuxing via versions
            versions: tag.attrib.versions,
            deviceTarget: tag.attrib['device-target']
        }));
    }

    /**
     * <edit-config> tag
     */
    getEditConfigs (platform) {
        return _getTags(this._et, 'edit-config', platform, tag => ({
            file: tag.attrib.file,
            target: tag.attrib.target,
            mode: tag.attrib.mode,
            xmls: tag.getchildren()
        }));
    }

    /**
     * <info> tags, both global and within a <platform>
     * TODO (kamrik): Do we ever use <info> under <platform>? Example wanted.
     *
     * @param {*} platform
     */
    getInfo (platform) {
        return _getTags(this._et, 'info', platform, elem => elem.text)
            // Filter out any undefined or empty strings.
            .filter(Boolean);
    }

    /**
     * <source-file>
     *
     * Examples:
     * <source-file src="src/ios/someLib.a" framework="true" />
     * <source-file src="src/ios/someLib.a" compiler-flags="-fno-objc-arc" />
     * @param {*} platform
     */
    getSourceFiles (platform) {
        return _getTagsInPlatform(this._et, 'source-file', platform, tag => ({
            itemType: 'source-file',
            src: tag.attrib.src,
            framework: isStrTrue(tag.attrib.framework),
            weak: isStrTrue(tag.attrib.weak),
            compilerFlags: tag.attrib['compiler-flags'],
            targetDir: tag.attrib['target-dir']
        }));
    }

    /**
     * <header-file>
     * Example:
     * <header-file src="CDVFoo.h" />
     * @param {*} platform
     */
    getHeaderFiles (platform) {
        return _getTagsInPlatform(this._et, 'header-file', platform, tag => ({
            itemType: 'header-file',
            src: tag.attrib.src,
            targetDir: tag.attrib['target-dir'],
            type: tag.attrib.type
        }));
    }

    /**
     * <resource-file>
     * Example:
     * <resource-file src="FooPluginStrings.xml" target="res/values/FooPluginStrings.xml" device-target="win" arch="x86" versions="&gt;=8.1" />
     * @param {*} platform
     */
    getResourceFiles (platform) {
        return _getTagsInPlatform(this._et, 'resource-file', platform, tag => ({
            itemType: 'resource-file',
            src: tag.attrib.src,
            target: tag.attrib.target,
            versions: tag.attrib.versions,
            deviceTarget: tag.attrib['device-target'],
            arch: tag.attrib.arch,
            reference: tag.attrib.reference
        }));
    }

    /**
     * <lib-file>
     * Example:
     * <lib-file src="src/BlackBerry10/native/device/libfoo.so" arch="device" />
     * @param {*} platform
     */
    getLibFiles (platform) {
        return _getTagsInPlatform(this._et, 'lib-file', platform, tag => ({
            itemType: 'lib-file',
            src: tag.attrib.src,
            arch: tag.attrib.arch,
            Include: tag.attrib.Include,
            versions: tag.attrib.versions,
            deviceTarget: tag.attrib['device-target'] || tag.attrib.target
        }));
    }

    //
    //

    /**
     * <podspec>
     * Example:
     *  <podspec>
     *      <config>
     *          <source url="https://github.com/brightcove/BrightcoveSpecs.git" />
     *          <source url="https://github.com/CocoaPods/Specs.git"/>
     *      </config>
     *      <pods use-frameworks="true" inhibit-all-warnings="true">
     *          <pod name="PromiseKit" />
     *          <pod name="Foobar1" spec="~> 2.0.0" />
     *          <pod name="Foobar2" git="git@github.com:hoge/foobar1.git" />
     *          <pod name="Foobar3" git="git@github.com:hoge/foobar2.git" branch="next" />
     *          <pod name="Foobar4" swift-version="4.1" />
     *          <pod name="Foobar5" swift-version="3.0" />
     *      </pods>
     *  </podspec>
     *
     * @param {*} platform
     */
    getPodSpecs (platform) {
        return _getTagsInPlatform(this._et, 'podspec', platform, tag => {
            const config = tag.find('config');
            const pods = tag.find('pods');
            const sources = config !== null ? (
                config.findall('source')
                    .map(t => ({ url: t.attrib.url }))
                    .reduce((acc, val) => Object.assign({}, acc, { [val.url]: { source: val.url } }), {})
            ) : null;

            const declarations = pods !== null ? (
                Object.keys(pods.attrib)
                    .reduce(
                        (acc, key) => pods.attrib[key] === undefined ? acc : Object.assign({}, acc, { [key]: pods.attrib[key] }), {}
                    )
            ) : null;

            const libraries = pods !== null ? (
                pods.findall('pod')
                    .map(
                        t => Object.keys(t.attrib).reduce((acc, key) => t.attrib[key] === undefined ? acc : Object.assign({}, acc, { [key]: t.attrib[key] }), {})
                    )
                    .reduce((acc, val) => Object.assign({}, acc, { [val.name]: val }), {})
            ) : null;

            return { declarations, sources, libraries };
        });
    }

    /**
     * <hook>
     * Example:
     * <hook type="before_build" src="scripts/beforeBuild.js" />
     * @param {*} hook
     * @param {*} platforms
     */
    getHookScripts (hook, platforms) {
        let scriptElements = this._et.findall('./hook');

        if (platforms) {
            platforms.forEach(platform => {
                scriptElements = scriptElements.concat(this._et.findall(`./platform[@name="${platform}"]/hook`));
            });
        }

        return scriptElements.filter(
            el => el.attrib.src && el.attrib.type && el.attrib.type.toLowerCase() === hook
        );
    }

    /**
     * <js-module>
     * @param {*} platform
     */
    getJsModules (platform) {
        return _getTags(this._et, 'js-module', platform, tag => ({
            itemType: 'js-module',
            name: tag.attrib.name,
            src: tag.attrib.src,
            clobbers: tag.findall('clobbers').map(tag => ({ target: tag.attrib.target })),
            merges: tag.findall('merges').map(tag => ({ target: tag.attrib.target })),
            runs: tag.findall('runs').length > 0
        }));
    }

    getEngines () {
        return this._et.findall('engines/engine').map(node => ({
            name: node.attrib.name,
            version: node.attrib.version,
            platform: node.attrib.platform,
            scriptSrc: node.attrib.scriptSrc
        }));
    }

    getPlatforms () {
        return this._et.findall('platform').map(n => ({ name: n.attrib.name }));
    }

    getPlatformsArray () {
        return this._et.findall('platform').map(n => n.attrib.name);
    }

    getFrameworks (platform, options) {
        return _getTags(this._et, 'framework', platform, el => {
            let src = el.attrib.src;

            if (options) {
                // get variable defaults from plugin.xml for removal
                const vars = options.cli_variables || this.getPreferences(platform);
                let regExp;

                // Iterate over plugin variables.
                // Replace them in framework src if they exist
                Object.keys(vars).forEach(name => {
                    if (vars[name]) {
                        regExp = new RegExp('\\$' + name, 'g');
                        src = src.replace(regExp, vars[name]);
                    }
                });
            }

            return {
                itemType: 'framework',
                type: el.attrib.type,
                parent: el.attrib.parent,
                custom: isStrTrue(el.attrib.custom),
                embed: isStrTrue(el.attrib.embed),
                src: src,
                spec: el.attrib.spec,
                weak: isStrTrue(el.attrib.weak),
                versions: el.attrib.versions,
                targetDir: el.attrib['target-dir'],
                deviceTarget: el.attrib['device-target'] || el.attrib.target,
                arch: el.attrib.arch,
                implementation: el.attrib.implementation
            };
        });
    }

    /**
     * *IMPORTANT*: Do not change the order of the return below. The files will be installed in this order.
     *
     * @param {*} platform
     * @param {*} options
     */
    getFilesAndFrameworks (platform, options) {
        return [].concat(
            this.getSourceFiles(platform),
            this.getHeaderFiles(platform),
            this.getResourceFiles(platform),
            this.getFrameworks(platform, options),
            this.getLibFiles(platform)
        );
    }
}

// Helper function used to prefix every element of an array with cordova-
// Useful when we want to modify platforms to be cordova-platform
const addCordova = someArray => someArray.map(element => `cordova-${element}`);

// Helper function used by most of the getSomething methods of PluginInfo.
// Get all elements of a given name. Both in root and in platform sections
// for the given platform. If transform is given and is a function, it is
// applied to each element.
function _getTags (pelem, tag, platform, transform) {
    const platformTag = pelem.find(`./platform[@name="${platform}"]`);

    let tagsInRoot = pelem.findall(tag);
    tagsInRoot = tagsInRoot || [];

    const tagsInPlatform = platformTag ? platformTag.findall(tag) : [];
    let tags = tagsInRoot.concat(tagsInPlatform);

    if (typeof transform === 'function') {
        tags = tags.map(transform);
    }

    return tags;
}

// Same as _getTags() but only looks inside a platform section.
function _getTagsInPlatform (pelem, tag, platform, transform) {
    const platformTag = pelem.find(`./platform[@name="${platform}"]`);
    let tags = platformTag ? platformTag.findall(tag) : [];

    if (typeof transform === 'function') {
        tags = tags.map(transform);
    }

    return tags;
}

// Check if x is a string 'true'.
const isStrTrue = x => String(x).toLowerCase() === 'true';

module.exports = PluginInfo;
// Backwards compat:
PluginInfo.PluginInfo = PluginInfo;
PluginInfo.loadPluginsDir = dir => {
    const PluginInfoProvider = require('./PluginInfoProvider');
    return new PluginInfoProvider().getAllWithinSearchPath(dir);
};
