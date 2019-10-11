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

const et = require('elementtree');
const xml = require('../util/xml-helpers');
const CordovaError = require('../CordovaError/CordovaError');
const fs = require('fs-extra');
const events = require('../events');

class ConfigParser {
    constructor (path) {
        this.path = path;

        try {
            this.doc = xml.parseElementtreeSync(path);
            this.cdvNamespacePrefix = getCordovaNamespacePrefix(this.doc);
            et.register_namespace(this.cdvNamespacePrefix, 'http://cordova.apache.org/ns/1.0');
        } catch (e) {
            events.emit('error', 'Parsing ' + path + ' failed');
            throw e;
        }

        const root = this.doc.getroot();
        if (root.tag !== 'widget') {
            throw new CordovaError(path + ' has incorrect root node name (expected "widget", was "' + root.tag + '")');
        }
    }

    getAttribute (attr) {
        return this.doc.getroot().attrib[attr];
    }

    packageName () {
        return this.getAttribute('id');
    }

    setPackageName (id) {
        this.doc.getroot().attrib.id = id;
    }

    android_packageName () {
        return this.getAttribute('android-packageName');
    }

    android_activityName () {
        return this.getAttribute('android-activityName');
    }

    ios_CFBundleIdentifier () {
        return this.getAttribute('ios-CFBundleIdentifier');
    }

    name () {
        return getNodeTextSafe(this.doc.find('name'));
    }

    setName (name) {
        const el = findOrCreate(this.doc, 'name');
        el.text = name;
    }

    shortName () {
        return this.doc.find('name').attrib.short || this.name();
    }

    setShortName (shortname) {
        const el = findOrCreate(this.doc, 'name');

        if (!el.text) el.text = shortname;

        el.attrib.short = shortname;
    }

    description () {
        return getNodeTextSafe(this.doc.find('description'));
    }

    setDescription (text) {
        const el = findOrCreate(this.doc, 'description');
        el.text = text;
    }

    version () {
        return this.getAttribute('version');
    }

    windows_packageVersion () {
        return this.getAttribute('windows-packageVersion');
    }

    android_versionCode () {
        return this.getAttribute('android-versionCode');
    }

    ios_CFBundleVersion () {
        return this.getAttribute('ios-CFBundleVersion');
    }

    setVersion (value) {
        this.doc.getroot().attrib.version = value;
    }

    author () {
        return getNodeTextSafe(this.doc.find('author'));
    }

    getGlobalPreference (name) {
        return findElementAttributeValue(name, this.doc.findall('preference'));
    }

    setGlobalPreference (name, value) {
        let pref = this.doc.find(`preference[@name="${name}"]`);

        if (!pref) {
            pref = new et.Element('preference');
            pref.attrib.name = name;
            this.doc.getroot().append(pref);
        }

        pref.attrib.value = value;
    }

    getPlatformPreference (name, platform) {
        return findElementAttributeValue(name, this.doc.findall('./platform[@name="' + platform + '"]/preference'));
    }

    setPlatformPreference (name, platform, value) {
        const platformEl = this.doc.find(`./platform[@name="${platform}"]`);
        if (!platformEl) throw new CordovaError(`platform does not exist (received platform: ${platform})`);

        const elems = this.doc.findall(`./platform[@name="${platform}"]/preference`);
        let pref = elems.filter(elem => elem.attrib.name.toLowerCase() === name.toLowerCase()).pop();

        if (!pref) {
            pref = new et.Element('preference');
            pref.attrib.name = name;
            platformEl.append(pref);
        }

        pref.attrib.value = value;
    }

    getPreference (name, platform) {
        return platform
            ? this.getPlatformPreference(name, platform)
            : this.getGlobalPreference(name);
    }

    setPreference (name, platform, value) {
        if (!value) {
            value = platform;
            platform = undefined;
        }

        if (platform) {
            this.setPlatformPreference(name, platform, value);
        } else {
            this.setGlobalPreference(name, value);
        }
    }

    /**
     * Returns all resources for the platform specified.
     * @param  {String} platform     The platform.
     * @param {string}  resourceName Type of static resources to return.
     *                               "icon" and "splash" currently supported.
     * @return {Array}               Resources for the platform specified.
     */
    getStaticResources (platform, resourceName) {
        const ret = [];
        let staticResources = [];
        if (platform) { // platform specific icons
            this.doc.findall('./platform[@name="' + platform + '"]/' + resourceName).forEach(function (elt) {
                elt.platform = platform; // mark as platform specific resource
                staticResources.push(elt);
            });
        }
        // root level resources
        staticResources = staticResources.concat(this.doc.findall(resourceName));
        // parse resource elements
        staticResources.forEach(elt => {
            var res = {};
            res.src = elt.attrib.src;
            res.target = elt.attrib.target || undefined;
            res.density = elt.attrib.density || elt.attrib[this.cdvNamespacePrefix + ':density'] || elt.attrib['gap:density'];
            res.platform = elt.platform || null; // null means icon represents default icon (shared between platforms)
            res.width = +elt.attrib.width || undefined;
            res.height = +elt.attrib.height || undefined;
            res.background = elt.attrib.background || undefined;
            res.foreground = elt.attrib.foreground || undefined;

            // default icon
            if (!res.width && !res.height && !res.density) {
                ret.defaultResource = res;
            }
            ret.push(res);
        });

        /**
         * Returns resource with specified width and/or height.
         * @param  {number} width Width of resource.
         * @param  {number} height Height of resource.
         * @return {Resource} Resource object or null if not found.
         */
        ret.getBySize = (width, height) => ret.filter(res => {
            if (!res.width && !res.height) return false;

            return ((!res.width || (width === res.width)) &&
                (!res.height || (height === res.height)));
        })[0] || null;

        /**
         * Returns resource with specified density.
         * @param  {string} density Density of resource.
         * @return {Resource}       Resource object or null if not found.
         */
        ret.getByDensity = density => ret.filter(res => res.density === density)[0] || null;

        /** Returns default icons */
        ret.getDefault = () => ret.defaultResource;

        return ret;
    }

    /**
     * Returns all icons for specific platform.
     * @param  {string} platform Platform name
     * @return {Resource[]}      Array of icon objects.
     */
    getIcons (platform) {
        return this.getStaticResources(platform, 'icon');
    }

    /**
     * Returns all splash images for specific platform.
     * @param  {string} platform Platform name
     * @return {Resource[]}      Array of Splash objects.
     */
    getSplashScreens (platform) {
        return this.getStaticResources(platform, 'splash');
    }

    /**
     * Returns all resource-files for a specific platform.
     * @param  {string} platform Platform name
     * @param  {boolean} includeGlobal Whether to return resource-files at the
     *                                 root level.
     * @return {Resource[]}      Array of resource file objects.
     */
    getFileResources (platform, includeGlobal) {
        let fileResources = [];

        if (platform) { // platform specific resources
            fileResources = this.doc.findall('./platform[@name="' + platform + '"]/resource-file').map(tag => ({
                platform: platform,
                src: tag.attrib.src,
                target: tag.attrib.target,
                versions: tag.attrib.versions,
                deviceTarget: tag.attrib['device-target'],
                arch: tag.attrib.arch
            }));
        }

        if (includeGlobal) {
            this.doc.findall('resource-file').forEach(tag => {
                fileResources.push({
                    platform: platform || null,
                    src: tag.attrib.src,
                    target: tag.attrib.target,
                    versions: tag.attrib.versions,
                    deviceTarget: tag.attrib['device-target'],
                    arch: tag.attrib.arch
                });
            });
        }

        return fileResources;
    }

    /**
     * Returns all hook scripts for the hook type specified.
     * @param  {String} hook     The hook type.
     * @param {Array}  platforms Platforms to look for scripts into (root scripts will be included as well).
     * @return {Array}               Script elements.
     */
    getHookScripts (hook, platforms) {
        let scriptElements = this.doc.findall('./hook');

        if (platforms) {
            platforms.forEach(platform => {
                scriptElements = scriptElements.concat(this.doc.findall('./platform[@name="' + platform + '"]/hook'));
            });
        }

        const filterScriptByHookType = el => el.attrib.src && el.attrib.type && el.attrib.type.toLowerCase() === hook;

        return scriptElements.filter(filterScriptByHookType);
    }

    /**
    * Returns a list of plugin (IDs).
    *
    * This function also returns any plugin's that
    * were defined using the legacy <feature> tags.
    * @return {string[]} Array of plugin IDs
    */
    getPluginIdList () {
        const plugins = this.doc.findall('plugin');
        const result = plugins.map(plugin => plugin.attrib.name);
        const features = this.doc.findall('feature');

        features.forEach(element => {
            const idTag = element.find('./param[@name="id"]');
            if (idTag) result.push(idTag.attrib.value);
        });

        return result;
    }

    getPlugins () {
        return this.getPluginIdList().map(pluginId => this.getPlugin(pluginId), this);
    }

    /**
     * Adds a plugin element. Does not check for duplicates.
     * @name addPlugin
     * @function
     * @param {object} attributes name and spec are supported
     * @param {Array|object} variables name, value or arbitary object
     */
    addPlugin (attributes, variables) {
        if (!attributes && !attributes.name) return;

        const el = new et.Element('plugin');
        el.attrib.name = attributes.name;

        if (attributes.spec) {
            el.attrib.spec = attributes.spec;
        }

        // support arbitrary object as variables source
        if (variables && typeof variables === 'object' && !Array.isArray(variables)) {
            variables = Object.keys(variables)
                .map(variableName => ({ name: variableName, value: variables[variableName] }));
        }

        if (variables) {
            variables.forEach(variable => {
                el.append(new et.Element('variable', { name: variable.name, value: variable.value }));
            });
        }

        this.doc.getroot().append(el);
    }

    /**
     * Retrives the plugin with the given id or null if not found.
     *
     * This function also returns any plugin's that
     * were defined using the legacy <feature> tags.
     * @name getPlugin
     * @function
     * @param {String} id
     * @returns {object} plugin including any variables
     */
    getPlugin (id) {
        if (!id) return undefined;

        const pluginElement = this.doc.find('./plugin/[@name="' + id + '"]');

        if (pluginElement === null) {
            const legacyFeature = this.doc.find('./feature/param[@name="id"][@value="' + id + '"]/..');

            if (legacyFeature) {
                events.emit('log', 'Found deprecated feature entry for ' + id + ' in config.xml.');
                return featureToPlugin(legacyFeature);
            }

            return undefined;
        }

        const plugin = {};
        plugin.name = pluginElement.attrib.name;
        plugin.spec = pluginElement.attrib.spec || pluginElement.attrib.src || pluginElement.attrib.version;
        plugin.variables = {};

        const variableElements = pluginElement.findall('variable');
        variableElements.forEach(varElement => {
            const name = varElement.attrib.name;
            const value = varElement.attrib.value;

            if (name) {
                plugin.variables[name] = value;
            }
        });

        return plugin;
    }

    /**
     * Remove the plugin entry with give name (id).
     *
     * This function also operates on any plugin's that
     * were defined using the legacy <feature> tags.
     * @name removePlugin
     * @function
     * @param id name of the plugin
     */
    removePlugin (id) {
        if (!id) return;

        const root = this.doc.getroot();
        removeChildren(root, `./plugin/[@name="${id}"]`);
        removeChildren(root, `./feature/param[@name="id"][@value="${id}"]/..`);
    }

    // Add any element to the root
    addElement (name, attributes) {
        const el = et.Element(name);

        for (const a in attributes) {
            el.attrib[a] = attributes[a];
        }

        this.doc.getroot().append(el);
    }

    /**
     * Adds an engine. Does not check for duplicates.
     * @param  {String} name the engine name
     * @param  {String} spec engine source location or version (optional)
     */
    addEngine (name, spec) {
        if (!name) return;

        const el = et.Element('engine');
        el.attrib.name = name;

        if (spec) {
            el.attrib.spec = spec;
        }

        this.doc.getroot().append(el);
    }

    /**
     * Removes all the engines with given name
     * @param  {String} name the engine name.
     */
    removeEngine (name) {
        removeChildren(this.doc.getroot(), `./engine/[@name="${name}"]`);
    }

    getEngines () {
        const engines = this.doc.findall('./engine');

        return engines.map(engine => ({
            name: engine.attrib.name,
            spec: engine.attrib.spec || engine.attrib.version || null
        }));
    }

    /* Get all the access tags */
    getAccesses () {
        const accesses = this.doc.findall('./access');

        return accesses.map(access => {
            const minimum_tls_version = access.attrib['minimum-tls-version']; /* String */
            const requires_forward_secrecy = access.attrib['requires-forward-secrecy']; /* Boolean */
            const requires_certificate_transparency = access.attrib['requires-certificate-transparency']; /* Boolean */
            const allows_arbitrary_loads_in_web_content = access.attrib['allows-arbitrary-loads-in-web-content']; /* Boolean */
            const allows_arbitrary_loads_in_media = access.attrib['allows-arbitrary-loads-in-media']; /* Boolean (DEPRECATED) */
            const allows_arbitrary_loads_for_media = access.attrib['allows-arbitrary-loads-for-media']; /* Boolean */
            const allows_local_networking = access.attrib['allows-local-networking']; /* Boolean */

            return {
                origin: access.attrib.origin,
                minimum_tls_version,
                requires_forward_secrecy,
                requires_certificate_transparency,
                allows_arbitrary_loads_in_web_content,
                allows_arbitrary_loads_in_media,
                allows_arbitrary_loads_for_media,
                allows_local_networking
            };
        });
    }

    /* Get all the allow-navigation tags */
    getAllowNavigations () {
        const allow_navigations = this.doc.findall('./allow-navigation');

        return allow_navigations.map(allow_navigation => {
            const minimum_tls_version = allow_navigation.attrib['minimum-tls-version']; /* String */
            const requires_forward_secrecy = allow_navigation.attrib['requires-forward-secrecy']; /* Boolean */
            const requires_certificate_transparency = allow_navigation.attrib['requires-certificate-transparency']; /* Boolean */

            return {
                href: allow_navigation.attrib.href,
                minimum_tls_version,
                requires_forward_secrecy,
                requires_certificate_transparency
            };
        });
    }

    /* Get all the allow-intent tags */
    getAllowIntents () {
        const allow_intents = this.doc.findall('./allow-intent');

        return allow_intents.map(allow_intent => ({
            href: allow_intent.attrib.href
        }));
    }

    /* Get all edit-config tags */
    getEditConfigs (platform) {
        const platform_edit_configs = this.doc.findall('./platform[@name="' + platform + '"]/edit-config');
        const edit_configs = this.doc.findall('edit-config').concat(platform_edit_configs);

        return edit_configs.map(tag => {
            const editConfig = {
                file: tag.attrib.file,
                target: tag.attrib.target,
                mode: tag.attrib.mode,
                id: 'config.xml',
                xmls: tag.getchildren()
            };

            return editConfig;
        });
    }

    /* Get all config-file tags */
    getConfigFiles (platform) {
        const platform_config_files = this.doc.findall('./platform[@name="' + platform + '"]/config-file');
        const config_files = this.doc.findall('config-file').concat(platform_config_files);

        return config_files.map(tag => {
            const configFile = {
                target: tag.attrib.target,
                parent: tag.attrib.parent,
                after: tag.attrib.after,
                xmls: tag.getchildren(),
                // To support demuxing via versions
                versions: tag.attrib.versions,
                deviceTarget: tag.attrib['device-target']
            };

            return configFile;
        });
    }

    write () {
        fs.writeFileSync(this.path, this.doc.write({ indent: 4 }), 'utf-8');
    }
}

const getNodeTextSafe = el => el && el.text && el.text.trim();

function findOrCreate (doc, name) {
    let ret = doc.find(name);

    if (!ret) {
        ret = new et.Element(name);
        doc.getroot().append(ret);
    }

    return ret;
}

function getCordovaNamespacePrefix (doc) {
    const rootAtribs = Object.getOwnPropertyNames(doc.getroot().attrib);
    let prefix = 'cdv';

    for (let j = 0; j < rootAtribs.length; j++) {
        if (rootAtribs[j].startsWith('xmlns:') &&
            doc.getroot().attrib[rootAtribs[j]] === 'http://cordova.apache.org/ns/1.0') {
            const strings = rootAtribs[j].split(':');
            prefix = strings[1];
            break;
        }
    }

    return prefix;
}

/**
 * Finds the value of an element's attribute
 * @param  {String} attributeName Name of the attribute to search for
 * @param  {Array}  elems         An array of ElementTree nodes
 * @return {String}
 */
const findElementAttributeValue = (attributeName, elems) => {
    elems = Array.isArray(elems) ? elems : [elems];

    return elems.filter(elem => elem.attrib.name.toLowerCase() === attributeName.toLowerCase())
        .map(filteredElems => filteredElems.attrib.value)
        .pop() || '';
};

// remove child from element for each match
const removeChildren = (el, selector) => {
    el.findall(selector).forEach(child => el.remove(child));
};

function featureToPlugin (featureElement) {
    const plugin = {};
    plugin.variables = [];

    let pluginVersion;
    let pluginSrc;

    const nodes = featureElement.findall('param');
    nodes.forEach(element => {
        const n = element.attrib.name;
        const v = element.attrib.value;

        if (n === 'id') {
            plugin.name = v;
        } else if (n === 'version') {
            pluginVersion = v;
        } else if (n === 'url' || n === 'installPath') {
            pluginSrc = v;
        } else {
            plugin.variables[n] = v;
        }
    });

    const spec = pluginSrc || pluginVersion;
    if (spec) {
        plugin.spec = spec;
    }

    return plugin;
}
module.exports = ConfigParser;
