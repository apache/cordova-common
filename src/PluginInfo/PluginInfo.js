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
const CordovaError = require('../CordovaError');

class PluginInfo {
    constructor (dirname) {
        this.filepath = path.join(dirname, 'plugin.xml');

        if (!fs.existsSync(this.filepath)) {
            throw new CordovaError(`Cannot find plugin.xml for plugin "${path.basename(dirname)}". Please try adding it again.`);
        }

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
    }

    // <preference> tag
    // Example: <preference name="API_KEY" />
    // Used to require a variable to be specified via --variable when installing the plugin.
    // returns { key : default | null}
    getPreferences (platform) {
        return _getTags(this._et, 'preference', platform, prefTag => {
            const name = prefTag.attrib.name.toUpperCase();
            const def = prefTag.attrib.default || null;
            return { preference: name, default: def };
        })
            .reduce((preferences, pref) => {
                preferences[pref.preference] = pref.default;
                return preferences;
            }, {});
    }

    // <asset>
    getAssets (platform) {
        return _getTags(this._et, 'asset', platform, tag => {
            const src = tag.attrib.src;
            const target = tag.attrib.target;

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
        return _getTags(this._et, 'dependency', platform, tag => {
            if (!tag.attrib.id) {
                throw new CordovaError(`<dependency> tag is missing id attribute in ${this.filepath}`);
            }

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
        return _getTagsInPlatform(this._et, 'source-file', platform, tag => ({
            itemType: 'source-file',
            src: tag.attrib.src,
            framework: isStrTrue(tag.attrib.framework),
            weak: isStrTrue(tag.attrib.weak),
            compilerFlags: tag.attrib['compiler-flags'],
            targetDir: tag.attrib['target-dir']
        }));
    }

    // <header-file>
    // Example:
    // <header-file src="CDVFoo.h" />
    getHeaderFiles (platform) {
        return _getTagsInPlatform(this._et, 'header-file', platform, tag => ({
            itemType: 'header-file',
            src: tag.attrib.src,
            targetDir: tag.attrib['target-dir'],
            type: tag.attrib.type
        }));
    }

    // <resource-file>
    // Example:
    // <resource-file src="FooPluginStrings.xml" target="res/values/FooPluginStrings.xml" device-target="win" arch="x86" versions="&gt;=8.1" />
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

    // <lib-file>
    // Example:
    // <lib-file src="src/BlackBerry10/native/device/libfoo.so" arch="device" />
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
            const omitUndefinedValues = obj => Object.entries(obj)
                .filter(([, value]) => value !== undefined)
                .reduce((acc, [key, value]) => Object.assign(acc, { [key]: value }), {});

            const config = tag.find('config');
            const pods = tag.find('pods');

            const sources = config !== null
                ? config.findall('source')
                    .map(el => ({ source: el.attrib.url }))
                    .reduce((acc, val) => Object.assign(acc, { [val.source]: val }), {})
                : null;

            const declarations = pods !== null
                ? omitUndefinedValues(pods.attrib)
                : null;

            const libraries = pods !== null
                ? pods.findall('pod')
                    .map(t => omitUndefinedValues(t.attrib))
                    .reduce((acc, val) => Object.assign(acc, { [val.name]: val }), {})
                : null;

            return { declarations, sources, libraries };
        });
    }

    // <hook>
    // Example:
    // <hook type="before_build" src="scripts/beforeBuild.js" />
    getHookScripts (hook, platforms) {
        let scriptElements = this._et.findall('./hook');

        if (platforms) {
            platforms.forEach(platform => {
                scriptElements = scriptElements.concat(this._et.findall(`./platform[@name="${platform}"]/hook`));
            });
        }

        function filterScriptByHookType (el) {
            return el.attrib.src && el.attrib.type && el.attrib.type.toLowerCase() === hook;
        }

        return scriptElements.filter(filterScriptByHookType);
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
        return this._et.findall('engines/engine').map(n => ({
            name: n.attrib.name,
            version: n.attrib.version,
            platform: n.attrib.platform,
            scriptSrc: n.attrib.scriptSrc
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
                let vars = options.cli_variables || {};

                if (Object.keys(vars).length === 0) {
                    // get variable defaults from plugin.xml for removal
                    vars = this.getPreferences(platform);
                }
                // Iterate over plugin variables.
                // Replace them in framework src if they exist
                Object.keys(vars).forEach(name => {
                    if (vars[name]) {
                        const regExp = new RegExp(`\\$${name}`, 'g');
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
                src,
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
            .concat(addCordova(this.getPlatformsArray()));
    }
}

// Helper function used to prefix every element of an array with cordova-
// Useful when we want to modify platforms to be cordova-platform
function addCordova (someArray) {
    return someArray.map(element => `cordova-${element}`);
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
