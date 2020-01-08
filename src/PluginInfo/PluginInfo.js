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
const { parseElementtreeSync } = require('../util/xml-helpers');
const CordovaError = require('../CordovaError');

class PluginInfo {
    constructor (dirname) {
        this.dir = dirname;
        this.filepath = path.join(dirname, 'plugin.xml');

        if (!fs.existsSync(this.filepath)) {
            throw new CordovaError(`Cannot find plugin.xml for plugin "${path.basename(dirname)}". Please try adding it again.`);
        }

        this._et = parseElementtreeSync(this.filepath);
        const root = this._et.getroot();

        this.id = root.attrib.id;
        this.version = root.attrib.version;

        // Optional fields
        const optTags = 'name description license repo issue info'.split(' ');
        for (const tag of optTags) {
            this[tag] = root.findtext(tag);
        }

        const keywordText = root.findtext('keywords');
        this.keywords = keywordText && keywordText.split(',').map(s => s.trim());
    }

    // <preference> tag
    // Example: <preference name="API_KEY" />
    // Used to require a variable to be specified via --variable when installing the plugin.
    // returns { key : default | null}
    getPreferences (platform) {
        return _getTags(this._et, 'preference', platform, ({ attrib }) => ({
            [attrib.name.toUpperCase()]: attrib.default || null
        }))
            .reduce((acc, pref) => Object.assign(acc, pref), {});
    }

    // <asset>
    getAssets (platform) {
        return _getTags(this._et, 'asset', platform, ({ attrib }) => {
            const src = attrib.src;
            const target = attrib.target;

            if (!src || !target) {
                throw new Error(`Malformed <asset> tag. Both "src" and "target" attributes must be specified in ${this.filepath}`);
            }

            return { itemType: 'asset', src, target };
        });
    }

    // <dependency>
    // Example:
    // <dependency id="com.plugin.id"
    //     url="https://github.com/myuser/someplugin"
    //     commit="428931ada3891801"
    //     subdir="some/path/here" />
    getDependencies (platform) {
        return _getTags(this._et, 'dependency', platform, ({ attrib }) => {
            if (!attrib.id) {
                throw new CordovaError(`<dependency> tag is missing id attribute in ${this.filepath}`);
            }

            return {
                id: attrib.id,
                version: attrib.version || '',
                url: attrib.url || '',
                subdir: attrib.subdir || '',
                commit: attrib.commit,
                git_ref: attrib.commit
            };
        });
    }

    // <config-file> tag
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

    getEditConfigs (platform) {
        return _getTags(this._et, 'edit-config', platform, tag => ({
            file: tag.attrib.file,
            target: tag.attrib.target,
            mode: tag.attrib.mode,
            xmls: tag.getchildren()
        }));
    }

    // <info> tags, both global and within a <platform>
    // TODO (kamrik): Do we ever use <info> under <platform>? Example wanted.
    getInfo (platform) {
        return _getTags(this._et, 'info', platform, elem => elem.text)
            // Filter out any undefined or empty strings.
            .filter(Boolean);
    }

    // <source-file>
    // Examples:
    // <source-file src="src/ios/someLib.a" framework="true" />
    // <source-file src="src/ios/someLib.a" compiler-flags="-fno-objc-arc" />
    getSourceFiles (platform) {
        return _getTagsInPlatform(this._et, 'source-file', platform, ({ attrib }) => ({
            itemType: 'source-file',
            src: attrib.src,
            framework: isStrTrue(attrib.framework),
            weak: isStrTrue(attrib.weak),
            compilerFlags: attrib['compiler-flags'],
            targetDir: attrib['target-dir']
        }));
    }

    // <header-file>
    // Example:
    // <header-file src="CDVFoo.h" />
    getHeaderFiles (platform) {
        return _getTagsInPlatform(this._et, 'header-file', platform, ({ attrib }) => ({
            itemType: 'header-file',
            src: attrib.src,
            targetDir: attrib['target-dir'],
            type: attrib.type
        }));
    }

    // <resource-file>
    // Example:
    // <resource-file src="FooPluginStrings.xml" target="res/values/FooPluginStrings.xml" device-target="win" arch="x86" versions="&gt;=8.1" />
    getResourceFiles (platform) {
        return _getTagsInPlatform(this._et, 'resource-file', platform, ({ attrib }) => ({
            itemType: 'resource-file',
            src: attrib.src,
            target: attrib.target,
            versions: attrib.versions,
            deviceTarget: attrib['device-target'],
            arch: attrib.arch,
            reference: attrib.reference
        }));
    }

    // <lib-file>
    // Example:
    // <lib-file src="src/BlackBerry10/native/device/libfoo.so" arch="device" />
    getLibFiles (platform) {
        return _getTagsInPlatform(this._et, 'lib-file', platform, ({ attrib }) => ({
            itemType: 'lib-file',
            src: attrib.src,
            arch: attrib.arch,
            Include: attrib.Include,
            versions: attrib.versions,
            deviceTarget: attrib['device-target'] || attrib.target
        }));
    }

    // <podspec>
    // Example:
    // <podspec>
    //   <config>
    //     <source url="https://github.com/brightcove/BrightcoveSpecs.git" />
    //     <source url="https://github.com/CocoaPods/Specs.git"/>
    //   </config>
    //   <pods use-frameworks="true" inhibit-all-warnings="true">
    //     <pod name="PromiseKit" />
    //     <pod name="Foobar1" spec="~> 2.0.0" />
    //     <pod name="Foobar2" git="git@github.com:hoge/foobar1.git" />
    //     <pod name="Foobar3" git="git@github.com:hoge/foobar2.git" branch="next" />
    //     <pod name="Foobar4" swift-version="4.1" />
    //     <pod name="Foobar5" swift-version="3.0" />
    //   </pods>
    // </podspec>
    getPodSpecs (platform) {
        return _getTagsInPlatform(this._et, 'podspec', platform, tag => {
            const config = tag.find('config');
            const pods = tag.find('pods');

            const sources = config && config.findall('source')
                .map(el => ({ source: el.attrib.url }))
                .reduce((acc, val) => Object.assign(acc, { [val.source]: val }), {});

            const declarations = pods && pods.attrib;

            const libraries = pods && pods.findall('pod')
                .map(t => t.attrib)
                .reduce((acc, val) => Object.assign(acc, { [val.name]: val }), {});

            return { declarations, sources, libraries };
        });
    }

    // <hook>
    // Example:
    // <hook type="before_build" src="scripts/beforeBuild.js" />
    getHookScripts (hook, platforms) {
        return _getTags(this._et, 'hook', platforms)
            .filter(({ attrib }) =>
                attrib.src && attrib.type &&
                attrib.type.toLowerCase() === hook
            );
    }

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
        return this._et.findall('engines/engine').map(({ attrib }) => ({
            name: attrib.name,
            version: attrib.version,
            platform: attrib.platform,
            scriptSrc: attrib.scriptSrc
        }));
    }

    getPlatforms () {
        return this._et.findall('platform').map(n => ({ name: n.attrib.name }));
    }

    getPlatformsArray () {
        return this._et.findall('platform').map(n => n.attrib.name);
    }

    getFrameworks (platform, options) {
        const { cli_variables = {} } = options || {};

        const vars = Object.keys(cli_variables).length === 0
            ? this.getPreferences(platform)
            : cli_variables;

        const varExpansions = Object.entries(vars)
            .filter(([, value]) => value)
            .map(([name, value]) =>
                s => s.replace(new RegExp(`\\$${name}`, 'g'), value)
            );

        // Replaces plugin variables in s if they exist
        const expandVars = s => varExpansions.reduce((acc, fn) => fn(acc), s);

        return _getTags(this._et, 'framework', platform, ({ attrib }) => ({
            itemType: 'framework',
            type: attrib.type,
            parent: attrib.parent,
            custom: isStrTrue(attrib.custom),
            embed: isStrTrue(attrib.embed),
            src: expandVars(attrib.src),
            spec: attrib.spec,
            weak: isStrTrue(attrib.weak),
            versions: attrib.versions,
            targetDir: attrib['target-dir'],
            deviceTarget: attrib['device-target'] || attrib.target,
            arch: attrib.arch,
            implementation: attrib.implementation
        }));
    }

    getFilesAndFrameworks (platform, options) {
        // Please avoid changing the order of the calls below, files will be
        // installed in this order.
        return [].concat(
            this.getSourceFiles(platform),
            this.getHeaderFiles(platform),
            this.getResourceFiles(platform),
            this.getFrameworks(platform, options),
            this.getLibFiles(platform)
        );
    }

    getKeywordsAndPlatforms () {
        return (this.keywords || [])
            .concat('ecosystem:cordova')
            .concat(this.getPlatformsArray().map(p => `cordova-${p}`));
    }
}

// Helper function used by most of the getSomething methods of PluginInfo.
// Get all elements of a given name. Both in root and in platform sections
// for the given platform. If transform is given and is a function, it is
// applied to each element.
function _getTags (pelem, tag, platform, transform) {
    let tags = pelem.findall(tag)
        .concat(_getTagsInPlatform(pelem, tag, platform));

    if (typeof transform === 'function') {
        tags = tags.map(transform);
    }

    return tags;
}

// Same as _getTags() but only looks inside a platform section.
function _getTagsInPlatform (pelem, tag, platform, transform) {
    const platforms = [].concat(platform);

    let tags = [].concat(...platforms.map(platform => {
        const platformTag = pelem.find(`./platform[@name="${platform}"]`);
        return platformTag ? platformTag.findall(tag) : [];
    }));

    if (typeof transform === 'function') {
        tags = tags.map(transform);
    }

    return tags;
}

// Check if x is a string 'true'.
function isStrTrue (x) {
    return String(x).toLowerCase() === 'true';
}

module.exports = PluginInfo;

// Backwards compat:
PluginInfo.PluginInfo = PluginInfo;
PluginInfo.loadPluginsDir = dir => {
    const PluginInfoProvider = require('./PluginInfoProvider');
    return new PluginInfoProvider().getAllWithinSearchPath(dir);
};
