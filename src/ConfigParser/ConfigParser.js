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
const CordovaError = require('../CordovaError');
const fs = require('fs-extra');
const events = require('../events');

const CDV_XMLNS_URI = 'http://cordova.apache.org/ns/1.0';

/** Wraps a config.xml file */
class ConfigParser {
    constructor (path) {
        this.path = path;

        try {
            this.doc = xml.parseElementtreeSync(path);
            this.cdvNamespacePrefix = getCordovaNamespacePrefix(this.doc);
            et.register_namespace(this.cdvNamespacePrefix, CDV_XMLNS_URI);
        } catch (e) {
            events.emit('error', `Parsing ${path} failed`);
            throw e;
        }

        const root = this.doc.getroot();
        if (root.tag !== 'widget') {
            throw new CordovaError(`${path} has incorrect root node name (expected "widget", was "${root.tag}")`);
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
        findOrCreate(this.doc, 'name').text = name;
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
        findOrCreate(this.doc, 'description').text = text;
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
        return this._getPrefElem(name).attrib.value;
    }

    setGlobalPreference (name, value) {
        this._getPrefElem(name, { create: true }).attrib.value = value;
    }

    getPlatformPreference (name, platform) {
        return this._getPrefElem(name, { platform }).attrib.value;
    }

    setPlatformPreference (name, platform, value) {
        this._getPrefElem(name, { platform, create: true }).attrib.value = value;
    }

    getPreference (name, platform) {
        return (platform && this.getPlatformPreference(name, platform)) ||
            this.getGlobalPreference(name);
    }

    setPreference (name, platform, value) {
        if (!value) {
            value = platform;
            platform = undefined;
        }

        this._getPrefElem(name, { platform, create: true }).attrib.value = value;
    }

    /**
     * Finds the element that determines the value of preference `name` within `parent`.
     *
     * @param {String} name preference name to search for (case insensitive)
     * @param {{create?: boolean, platform?: string}} [opts]
     * @return {et.Element} the last matching preference in `parent` (possibly created)
     */
    _getPrefElem (name, { create = false, platform } = {}) {
        const parent = platform
            ? this.doc.findall(`./platform[@name="${platform}"]`).pop()
            : this.doc.getroot();

        const makeElem = create ? et.SubElement.bind(null, parent) : et.Element;
        const getFallBackElem = () => makeElem('preference', { name, value: '' });

        if (!parent) {
            if (create) {
                throw new CordovaError(`platform does not exist (received platform: ${platform})`);
            }
            return getFallBackElem();
        }

        return parent.findall('preference')
            .filter(elem => elem.attrib.name.toLowerCase() === name.toLowerCase())
            .pop() || getFallBackElem();
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
            this.doc.findall(`./platform[@name="${platform}"]/${resourceName}`).forEach(elt => {
                elt.platform = platform; // mark as platform specific resource
                staticResources.push(elt);
            });
        }
        // root level resources
        staticResources = staticResources.concat(this.doc.findall(resourceName));
        // parse resource elements
        staticResources.forEach(elt => {
            const res = {};
            res.src = elt.attrib.src;
            res.target = elt.attrib.target || undefined;
            res.density = elt.attrib.density || elt.attrib[`${this.cdvNamespacePrefix}:density`] || elt.attrib['gap:density'];
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
        ret.getBySize = (width, height) => {
            return ret.filter(res => {
                if (!res.width && !res.height) {
                    return false;
                }
                return ((!res.width || (width === res.width)) &&
                    (!res.height || (height === res.height)));
            })[0] || null;
        };

        /**
         * Returns resource with specified density.
         * @param  {string} density Density of resource.
         * @return {Resource}       Resource object or null if not found.
         */
        ret.getByDensity = density => {
            return ret.filter(res => res.density === density)[0] || null;
        };

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
            fileResources = this.doc.findall(`./platform[@name="${platform}"]/resource-file`).map(tag => ({
                platform,
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
                scriptElements = scriptElements.concat(this.doc.findall(`./platform[@name="${platform}"]/hook`));
            });
        }

        function filterScriptByHookType (el) {
            return el.attrib.src && el.attrib.type && el.attrib.type.toLowerCase() === hook;
        }

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
        return this.getPluginIdList().map(pluginId => this.getPlugin(pluginId));
    }

    /**
     * Adds a plugin element. Does not check for duplicates.
     *
     * @param {object} attributes name and spec are supported
     * @param {Array|object} variables name, value or arbitary object
     */
    addPlugin (attributes, variables) {
        if (!attributes && !attributes.name) return;

        // support arbitrary object as variables source
        variables = variables || [];
        if (typeof variables === 'object' && !Array.isArray(variables)) {
            variables = Object.entries(variables)
                .map(([name, value]) => ({ name, value }));
        }

        const el = et.SubElement(this.doc.getroot(), 'plugin', attributes);

        variables.forEach(({ name, value }) => {
            et.SubElement(el, 'variable', { name, value });
        });
    }

    /**
     * Retrives the plugin with the given id or null if not found.
     *
     * This function also returns any plugin's that
     * were defined using the legacy <feature> tags.
     *
     * @param {String} id
     * @returns {object} plugin including any variables
     */
    getPlugin (id) {
        if (!id) {
            return undefined;
        }
        const pluginElement = this.doc.find(`./plugin/[@name="${id}"]`);
        if (pluginElement === null) {
            const legacyFeature = this.doc.find(`./feature/param[@name="id"][@value="${id}"]/..`);
            if (legacyFeature) {
                events.emit('log', `Found deprecated feature entry for ${id} in config.xml.`);
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
     *
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
        et.SubElement(this.doc.getroot(), name, attributes);
    }

    /**
     * Adds an engine. Does not check for duplicates.
     * @param  {String} name the engine name
     * @param  {String} spec engine source location or version (optional)
     */
    addEngine (name, spec) {
        if (!name) return;

        const attrs = Object.assign({ name }, spec ? { spec } : null);
        et.SubElement(this.doc.getroot(), 'engine', attrs);
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
        return engines.map(engine => {
            const spec = engine.attrib.spec || engine.attrib.version;
            return {
                name: engine.attrib.name,
                spec: spec || null
            };
        });
    }

    /* Get all the access tags */
    getAccesses () {
        return this.doc.findall('./access').map(element => ({
            origin: element.attrib.origin,
            minimum_tls_version: element.get('minimum-tls-version'),
            requires_forward_secrecy: element.get('requires-forward-secrecy'),
            requires_certificate_transparency: element.get('requires-certificate-transparency'),
            allows_arbitrary_loads_in_web_content: element.get('allows-arbitrary-loads-in-web-content'),
            allows_arbitrary_loads_in_media: element.get('allows-arbitrary-loads-in-media'),
            allows_arbitrary_loads_for_media: element.get('allows-arbitrary-loads-for-media'),
            allows_local_networkin: element.get('allows-local-networking')
        }));
    }

    /* Get all the allow-navigation tags */
    getAllowNavigations () {
        return this.doc.findall('./allow-navigation').map(element => ({
            href: element.attrib.href,
            minimum_tls_version: element.get('minimum-tls-version'),
            requires_forward_secrecy: element.get('requires-forward-secrecy'),
            requires_certificate_transparenc: element.get('requires-certificate-transparency')
        }));
    }

    /* Get all the allow-intent tags */
    getAllowIntents () {
        return this.doc.findall('./allow-intent').map(element => ({
            href: element.attrib.href
        }));
    }

    /* Get all edit-config tags */
    getEditConfigs (platform) {
        const platform_edit_configs = this.doc.findall(`./platform[@name="${platform}"]/edit-config`);
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
        const platform_config_files = this.doc.findall(`./platform[@name="${platform}"]/config-file`);
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

function getNodeTextSafe (el) {
    return el && el.text && el.text.trim();
}

function findOrCreate (doc, name) {
    const parent = doc.getroot();
    return parent.find(name) || new et.SubElement(parent, name);
}

function getCordovaNamespacePrefix (doc) {
    const attrs = doc.getroot().attrib;
    const nsAttr = Object.keys(attrs).find(key =>
        key.startsWith('xmlns:') && attrs[key] === CDV_XMLNS_URI
    );

    return nsAttr ? nsAttr.split(':')[1] : 'cdv';
}

// remove child from element for each match
function removeChildren (el, selector) {
    el.findall(selector).forEach(child => el.remove(child));
}

function featureToPlugin (featureElement) {
    const plugin = {};
    plugin.variables = [];
    let pluginVersion, pluginSrc;

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
