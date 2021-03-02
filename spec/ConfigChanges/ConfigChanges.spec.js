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

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const et = require('elementtree');

const configChanges = require('../../src/ConfigChanges/ConfigChanges');
const mungeutil = require('../../src/ConfigChanges/munge-util');
const xml_helpers = require('../../src/util/xml-helpers');
const PlatformJson = require('../../src/PlatformJson');
const PluginInfoProvider = require('../../src/PluginInfo/PluginInfoProvider');
const PluginInfo = require('../../src/PluginInfo/PluginInfo');
const ConfigParser = require('../../src/ConfigParser/ConfigParser');

const fixturePath = path.join(__dirname, '../fixtures');

// XML fixtures
const xml = path.join(fixturePath, 'test-config.xml');
const editconfig_xml = path.join(fixturePath, 'test-editconfig.xml');
const configfile_xml = path.join(fixturePath, 'test-configfile.xml');

// Project fixtures
const android_two_project = path.join(fixturePath, 'projects/android_two/');
const android_two_no_perms_project = path.join(fixturePath, 'projects/android_two_no_perms');
const ios_config_xml = path.join(fixturePath, 'projects/ios-config-xml/');

// Plugin fixtures
const dummyplugin = path.join(fixturePath, 'plugins/org.test.plugins.dummyplugin');
const cbplugin = path.join(fixturePath, 'plugins/org.test.plugins.childbrowser');
const childrenplugin = path.join(fixturePath, 'plugins/org.test.multiple-children');
const shareddepsplugin = path.join(fixturePath, 'plugins/org.test.shareddeps');
const configplugin = path.join(fixturePath, 'plugins/org.test.configtest');
const editconfigplugin = path.join(fixturePath, 'plugins/org.test.editconfigtest');
const editconfigplugin_two = path.join(fixturePath, 'plugins/org.test.editconfigtest_two');
const varplugin = path.join(fixturePath, 'plugins/com.adobe.vars');
const plistplugin = path.join(fixturePath, 'plugins/org.apache.plist');
const bplistplugin = path.join(fixturePath, 'plugins/org.apache.bplist');

const temp = path.join(os.tmpdir(), 'plugman');
const plugins_dir = path.join(temp, 'cordova', 'plugins');

const cfg = new ConfigParser(xml);
const pluginInfoProvider = new PluginInfoProvider();

// TODO: dont do fs so much

function innerXML (xmltext) {
    return xmltext.replace(/^<[\w\s\-=/".]+>/, '').replace(/<\/[\w\s\-=/".]+>$/, '');
}

function get_munge_change () {
    return mungeutil.deep_find.apply(null, arguments);
}

function install_plugin (pluginPath) {
    fs.copySync(pluginPath, path.join(plugins_dir, path.basename(pluginPath)));
}

describe('config-changes module', function () {
    beforeEach(function () {
        fs.ensureDirSync(temp);
        fs.ensureDirSync(plugins_dir);
    });
    afterEach(function () {
        fs.removeSync(temp);
    });

    describe('queue methods', function () {
        describe('addInstalledPluginToPrepareQueue', function () {
            it('Test 001 : should append specified plugin to platform.json', function () {
                const platformJson = new PlatformJson(null, 'android', null);
                platformJson.addInstalledPluginToPrepareQueue('org.test.plugins.dummyplugin', {});

                const json = platformJson.root;
                expect(json.prepare_queue.installed[0].plugin).toEqual('org.test.plugins.dummyplugin');
                expect(json.prepare_queue.installed[0].vars).toEqual({});
            });

            it('Test 002 : should append specified plugin with any variables to platform.json', function () {
                const platformJson = new PlatformJson(null, 'android', null);
                platformJson.addInstalledPluginToPrepareQueue('org.test.plugins.dummyplugin', { dude: 'man' });

                const json = platformJson.root;
                expect(json.prepare_queue.installed[0].plugin).toEqual('org.test.plugins.dummyplugin');
                expect(json.prepare_queue.installed[0].vars).toEqual({ dude: 'man' });
            });
        });

        describe('addUninstalledPluginToPrepareQueue', function () {
            it('Test 003 : should append specified plugin to platform.json', function () {
                const platformJson = new PlatformJson(null, 'android', null);
                platformJson.addUninstalledPluginToPrepareQueue('org.test.plugins.dummyplugin');

                const json = platformJson.root;
                expect(json.prepare_queue.uninstalled[0].plugin).toEqual('org.test.plugins.dummyplugin');
            });
        });
    });

    describe('load method', function () {
        it('Test 004 : should return an empty config json object if file doesn\'t exist', function () {
            const platformJson = PlatformJson.load(plugins_dir, 'android');
            expect(platformJson.root).toBeDefined();
            expect(platformJson.root.prepare_queue).toBeDefined();
            expect(platformJson.root.config_munge).toBeDefined();
            expect(platformJson.root.installed_plugins).toBeDefined();
        });

        it('Test 005 : should return the json file if it exists', function () {
            const filepath = path.join(plugins_dir, 'android.json');
            const json = {
                prepare_queue: { installed: [], uninstalled: [] },
                config_munge: { files: { some_file: { parents: { some_parent: [{ xml: 'some_change', count: 1 }] } } } },
                installed_plugins: {},
                dependent_plugins: {}
            };
            fs.writeFileSync(filepath, JSON.stringify(json), 'utf-8');

            const platformJson = PlatformJson.load(plugins_dir, 'android');
            expect(JSON.stringify(json)).toEqual(JSON.stringify(platformJson.root));
        });
    });

    describe('save method', function () {
        it('Test 006 : should write out specified json', function () {
            const filepath = path.join(plugins_dir, 'android.json');
            const platformJson = new PlatformJson(filepath, 'android', { foo: true });
            platformJson.save();
            expect(JSON.parse(fs.readFileSync(filepath, 'utf-8'))).toEqual(platformJson.root);
        });
    });

    describe('generate_plugin_config_munge method', function () {
        describe('for android projects', function () {
            beforeEach(function () {
                fs.copySync(android_two_project, temp);
            });

            it('Test 007 : should return a flat config hierarchy for simple, one-off config changes', function () {
                let xml;
                const dummy_xml = new et.ElementTree(et.XML(fs.readFileSync(path.join(dummyplugin, 'plugin.xml'), 'utf-8')));
                const munger = new configChanges.PlatformMunger('android', temp, 'unused', null, pluginInfoProvider);
                const munge = munger.generate_plugin_config_munge(pluginInfoProvider.get(dummyplugin), {});
                expect(munge.files['AndroidManifest.xml']).toBeDefined();
                expect(munge.files['AndroidManifest.xml'].parents['/manifest/application']).toBeDefined();
                xml = (new et.ElementTree(dummy_xml.find('./platform[@name="android"]/config-file[@target="AndroidManifest.xml"]'))).write({ xml_declaration: false });
                xml = innerXML(xml);
                expect(get_munge_change(munge, 'AndroidManifest.xml', '/manifest/application', xml).count).toEqual(1);
                expect(munge.files['res/xml/plugins.xml']).toBeDefined();
                expect(munge.files['res/xml/plugins.xml'].parents['/plugins']).toBeDefined();
                xml = (new et.ElementTree(dummy_xml.find('./platform[@name="android"]/config-file[@target="res/xml/plugins.xml"]'))).write({ xml_declaration: false });
                xml = innerXML(xml);
                expect(get_munge_change(munge, 'res/xml/plugins.xml', '/plugins', xml).count).toEqual(1);
                expect(munge.files['res/xml/config.xml']).toBeDefined();
                expect(munge.files['res/xml/config.xml'].parents['/cordova/plugins']).toBeDefined();
                xml = (new et.ElementTree(dummy_xml.find('./platform[@name="android"]/config-file[@target="res/xml/config.xml"]'))).write({ xml_declaration: false });
                xml = innerXML(xml);
                expect(get_munge_change(munge, 'res/xml/config.xml', '/cordova/plugins', xml).count).toEqual(1);
            });

            it('Test 008 : should split out multiple children of config-file elements into individual leaves', function () {
                const munger = new configChanges.PlatformMunger('android', temp, 'unused', null, pluginInfoProvider);
                const munge = munger.generate_plugin_config_munge(pluginInfoProvider.get(childrenplugin), { PACKAGE_NAME: 'com.alunny.childapp' });
                expect(munge.files['AndroidManifest.xml']).toBeDefined();
                expect(munge.files['AndroidManifest.xml'].parents['/manifest']).toBeDefined();
                expect(get_munge_change(munge, 'AndroidManifest.xml', '/manifest', '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />')).toBeDefined();
                expect(get_munge_change(munge, 'AndroidManifest.xml', '/manifest', '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />')).toBeDefined();
                expect(get_munge_change(munge, 'AndroidManifest.xml', '/manifest', '<uses-permission android:name="android.permission.READ_PHONE_STATE" />')).toBeDefined();
                expect(get_munge_change(munge, 'AndroidManifest.xml', '/manifest', '<uses-permission android:name="android.permission.INTERNET" />')).toBeDefined();
                expect(get_munge_change(munge, 'AndroidManifest.xml', '/manifest', '<uses-permission android:name="android.permission.GET_ACCOUNTS" />')).toBeDefined();
                expect(get_munge_change(munge, 'AndroidManifest.xml', '/manifest', '<uses-permission android:name="android.permission.WAKE_LOCK" />')).toBeDefined();
                expect(get_munge_change(munge, 'AndroidManifest.xml', '/manifest', '<permission android:name="com.alunny.childapp.permission.C2D_MESSAGE" android:protectionLevel="signature" />')).toBeDefined();
                expect(get_munge_change(munge, 'AndroidManifest.xml', '/manifest', '<uses-permission android:name="com.alunny.childapp.permission.C2D_MESSAGE" />')).toBeDefined();
                expect(get_munge_change(munge, 'AndroidManifest.xml', '/manifest', '<uses-permission android:name="com.google.android.c2dm.permission.RECEIVE" />')).toBeDefined();
            });

            it('Test 009 : should not use xml comments as config munge leaves', function () {
                const munger = new configChanges.PlatformMunger('android', temp, 'unused', null, pluginInfoProvider);
                const munge = munger.generate_plugin_config_munge(pluginInfoProvider.get(childrenplugin), {});
                expect(get_munge_change(munge, 'AndroidManifest.xml', '/manifest', '<!--library-->')).not.toBeDefined();
                expect(get_munge_change(munge, 'AndroidManifest.xml', '/manifest', '<!-- GCM connects to Google Services. -->')).not.toBeDefined();
            });

            it('Test 010 : should increment config hierarchy leaves if different config-file elements target the same file + selector + xml', function () {
                const munger = new configChanges.PlatformMunger('android', temp, 'unused', null, pluginInfoProvider);
                const munge = munger.generate_plugin_config_munge(pluginInfoProvider.get(configplugin), {});
                expect(get_munge_change(munge, 'res/xml/config.xml', '/widget', '<poop />').count).toEqual(2);
            });

            it('Test 011 : should take into account interpolation variables', function () {
                const munger = new configChanges.PlatformMunger('android', temp, 'unused', null, pluginInfoProvider);
                const munge = munger.generate_plugin_config_munge(pluginInfoProvider.get(childrenplugin), { PACKAGE_NAME: 'ca.filmaj.plugins' });
                expect(get_munge_change(munge, 'AndroidManifest.xml', '/manifest', '<uses-permission android:name="ca.filmaj.plugins.permission.C2D_MESSAGE" />')).toBeDefined();
            });

            it('Test 012 : should create munges for platform-agnostic config.xml changes', function () {
                const munger = new configChanges.PlatformMunger('android', temp, 'unused', null, pluginInfoProvider);
                const munge = munger.generate_plugin_config_munge(pluginInfoProvider.get(dummyplugin), {});
                expect(get_munge_change(munge, 'config.xml', '/*', '<access origin="build.phonegap.com" />')).toBeDefined();
                expect(get_munge_change(munge, 'config.xml', '/*', '<access origin="s3.amazonaws.com" />')).toBeDefined();
            });
        });
    });

    describe('processing of plugins (via process method)', function () {
        beforeEach(function () {
            install_plugin(dummyplugin);
        });

        it('Test 014 : should generate config munges for queued plugins', function () {
            fs.copySync(android_two_project, temp);
            const platformJson = PlatformJson.load(plugins_dir, 'android');
            platformJson.root.prepare_queue.installed = [{ plugin: 'org.test.plugins.dummyplugin', vars: {} }];
            const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
            const spy = spyOn(munger, 'generate_plugin_config_munge').and.returnValue({});
            munger.process(plugins_dir);
            expect(spy).toHaveBeenCalledWith(jasmine.any(PluginInfo), {}, []);
        });

        describe(': installation', function () {
            describe('of xml config files', function () {
                beforeEach(function () {
                    fs.copySync(android_two_project, temp);
                });

                it('Test 015 : should call graftXML for every new config munge it introduces (every leaf in config munge that does not exist)', function () {
                    const platformJson = PlatformJson.load(plugins_dir, 'android');
                    platformJson.root.prepare_queue.installed = [{ plugin: 'org.test.plugins.dummyplugin', vars: {} }];

                    const spy = spyOn(xml_helpers, 'graftXML').and.returnValue(true);

                    const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                    munger.process(plugins_dir);
                    expect(spy.calls.count()).toEqual(4);
                    expect(spy.calls.argsFor(0)[2]).toEqual('/*');
                    expect(spy.calls.argsFor(1)[2]).toEqual('/*');
                    expect(spy.calls.argsFor(2)[2]).toEqual('/manifest/application');
                    expect(spy.calls.argsFor(3)[2]).toEqual('/cordova/plugins');
                });

                it('Test 016 : should not call graftXML for a config munge that already exists from another plugin', function () {
                    install_plugin(configplugin);
                    const platformJson = PlatformJson.load(plugins_dir, 'android');
                    platformJson.addInstalledPluginToPrepareQueue('org.test.configtest', {});

                    const spy = spyOn(xml_helpers, 'graftXML').and.returnValue(true);
                    const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                    munger.process(plugins_dir);
                    expect(spy.calls.count()).toEqual(1);
                });

                it('Test 017 : should not call graftXML for a config munge targeting a config file that does not exist', function () {
                    const platformJson = PlatformJson.load(plugins_dir, 'android');
                    platformJson.addInstalledPluginToPrepareQueue('org.test.plugins.dummyplugin', {});

                    const spy = spyOn(fs, 'readFileSync').and.callThrough();

                    const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                    munger.process(plugins_dir);
                    expect(spy).not.toHaveBeenCalledWith(path.join(temp, 'res', 'xml', 'plugins.xml'), 'utf-8');
                });

                it('Test 018 : should call graftXMLMerge for every new config munge with mode \'merge\' it introduces', function () {
                    install_plugin(editconfigplugin);

                    const platformJson = PlatformJson.load(plugins_dir, 'android');
                    platformJson.addInstalledPluginToPrepareQueue('org.test.editconfigtest', {});

                    const spy = spyOn(xml_helpers, 'graftXMLMerge').and.returnValue(true);

                    const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                    munger.process(plugins_dir);
                    expect(spy.calls.count()).toEqual(1);
                    expect(spy.calls.argsFor(0)[2]).toEqual('/manifest/application/activity[@android:name=\'org.test.DroidGap\']');
                });

                it('Test 019 : should call graftXMLMerge with --force for every new config munge with mode \'merge\' it introduces', function () {
                    install_plugin(editconfigplugin);
                    install_plugin(editconfigplugin_two);

                    const platformJson = PlatformJson.load(plugins_dir, 'android');
                    platformJson.addInstalledPluginToPrepareQueue('org.test.editconfigtest', {});
                    platformJson.addInstalledPluginToPrepareQueue('org.test.editconfigtest_two', {}, true, true);

                    const spy = spyOn(xml_helpers, 'graftXMLMerge').and.returnValue(true);

                    const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                    munger.process(plugins_dir);
                    expect(spy.calls.count()).toEqual(3);
                    expect(spy.calls.argsFor(0)[2]).toEqual('/manifest/application/activity[@android:name=\'org.test.DroidGap\']');
                    expect(spy.calls.argsFor(1)[2]).toEqual('/manifest/application/activity[@android:name=\'org.test.DroidGap\']');
                    expect(spy.calls.argsFor(2)[2]).toEqual('/manifest/uses-sdk');
                });

                it('Test 020 : should call graftXMLOverwrite for every new config munge with mode \'overwrite\' it introduces', function () {
                    install_plugin(editconfigplugin);

                    const platformJson = PlatformJson.load(plugins_dir, 'android');
                    platformJson.addInstalledPluginToPrepareQueue('org.test.editconfigtest', {});

                    const spy = spyOn(xml_helpers, 'graftXMLOverwrite').and.returnValue(true);

                    const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                    munger.process(plugins_dir);
                    expect(spy.calls.count()).toEqual(1);
                    expect(spy.calls.argsFor(0)[2]).toEqual('/manifest/application/activity');
                });

                it('Test 021 : should call graftXMLOverwrite with --force for every new config munge with mode \'overwrite\' it introduces', function () {
                    install_plugin(editconfigplugin);
                    install_plugin(editconfigplugin_two);

                    const platformJson = PlatformJson.load(plugins_dir, 'android');
                    platformJson.addInstalledPluginToPrepareQueue('org.test.editconfigtest', {});
                    platformJson.addInstalledPluginToPrepareQueue('org.test.editconfigtest_two', {}, true, true);

                    const spy = spyOn(xml_helpers, 'graftXMLOverwrite').and.returnValue(true);

                    const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                    munger.process(plugins_dir);
                    expect(spy.calls.count()).toEqual(2);
                    expect(spy.calls.argsFor(0)[2]).toEqual('/manifest/application/activity');
                    expect(spy.calls.argsFor(1)[2]).toEqual('/manifest/application/activity[@android:name=\'ChildApp\']');
                });

                it('Test 022 : should not install plugin when there are edit-config conflicts', function () {
                    install_plugin(editconfigplugin);
                    install_plugin(editconfigplugin_two);

                    const platformJson = PlatformJson.load(plugins_dir, 'android');
                    platformJson.addInstalledPluginToPrepareQueue('org.test.editconfigtest', {});
                    platformJson.addInstalledPluginToPrepareQueue('org.test.editconfigtest_two', {});

                    const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                    expect(function () { munger.process(plugins_dir); }).toThrow(new Error('There was a conflict trying to modify attributes with <edit-config> in plugin org.test.editconfigtest_two. The conflicting plugin, org.test.editconfigtest, already modified the same attributes. The conflict must be resolved before org.test.editconfigtest_two can be added. You may use --force to add the plugin and overwrite the conflicting attributes.'));
                });

                it('should call graftXMLMerge for every new config.xml config munge with mode \'merge\' it introduces', function () {
                    const platformJson = PlatformJson.load(plugins_dir, 'android');

                    const spy = spyOn(xml_helpers, 'graftXMLMerge').and.returnValue(true);

                    const munger = new configChanges.PlatformMunger('android', temp, platformJson);
                    munger.add_config_changes(cfg, true);

                    expect(spy.calls.count()).toEqual(1);
                    expect(spy.calls.argsFor(0)[2]).toEqual('/manifest/uses-sdk');
                });

                it('should call graftXMLOverwrite for every new config.xml config munge with mode \'overwrite\' it introduces', function () {
                    const platformJson = PlatformJson.load(plugins_dir, 'android');

                    const spy = spyOn(xml_helpers, 'graftXMLOverwrite').and.returnValue(true);

                    const munger = new configChanges.PlatformMunger('android', temp, platformJson);
                    munger.add_config_changes(cfg, true);

                    expect(spy.calls.count()).toEqual(1);
                    expect(spy.calls.argsFor(0)[2]).toEqual('/manifest/uses-sdk');
                });

                it('should call pruneXMLRemove for every new config.xml config munge with mode \'remove\' it introduces', function () {
                    const platformJson = PlatformJson.load(plugins_dir, 'android');

                    // var spy = spyOn(xml_helpers, 'pruneXMLRemove').andReturn(true);

                    const munger = new configChanges.PlatformMunger('android', temp, platformJson);
                    munger.add_config_changes(cfg, true).save_all();

                    const am_xml = new et.ElementTree(et.XML(fs.readFileSync(path.join(temp, 'AndroidManifest.xml'), 'utf-8')));
                    const sdk = am_xml.find('./uses-sdk');

                    expect(sdk).toBeDefined();
                    expect(sdk.attrib['android:maxSdkVersion']).toBeUndefined();
                });

                it('should overwrite plugin config munge for every conflicting config.xml config munge', function () {
                    install_plugin(editconfigplugin_two);

                    const platformJson = PlatformJson.load(plugins_dir, 'android');
                    platformJson.addInstalledPluginToPrepareQueue('org.test.editconfigtest_two', {}, true, true);

                    const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                    munger.process(plugins_dir);
                    munger.add_config_changes(cfg, true).save_all();

                    const am_xml = new et.ElementTree(et.XML(fs.readFileSync(path.join(temp, 'AndroidManifest.xml'), 'utf-8')));
                    const sdk = am_xml.find('./uses-sdk');
                    expect(sdk).toBeDefined();
                    expect(sdk.attrib['android:targetSdkVersion']).toEqual('24');
                });

                it('should overwrite config.xml config munge for every new config.xml config munge that has the same target', function () {
                    const editconfig_cfg = new ConfigParser(editconfig_xml);
                    const platformJson = PlatformJson.load(plugins_dir, 'android');
                    const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                    munger.add_config_changes(cfg, true).save_all();
                    munger.add_config_changes(editconfig_cfg, true).save_all();

                    const am_xml = new et.ElementTree(et.XML(fs.readFileSync(path.join(temp, 'AndroidManifest.xml'), 'utf-8')));
                    const sdk = am_xml.find('./uses-sdk');
                    expect(sdk).toBeDefined();
                    expect(sdk.attrib['android:targetSdkVersion']).toEqual('23');
                    expect(sdk.attrib['android:minSdkVersion']).toEqual('5');
                    expect(sdk.attrib['android:maxSdkVersion']).toBeUndefined();
                });

                it('should append new children to XML document tree', function () {
                    const configfile_cfg = new ConfigParser(configfile_xml);
                    const platformJson = PlatformJson.load(plugins_dir, 'android');
                    const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                    munger.add_config_changes(configfile_cfg, true).save_all();
                    const am_xml = new et.ElementTree(et.XML(fs.readFileSync(path.join(temp, 'AndroidManifest.xml'), 'utf-8')));
                    const activity = am_xml.find('./application/activity[@android:name="com.foo.Bar"]');
                    expect(activity).toBeDefined();
                    expect(activity.attrib['android:label']).toEqual('@string/app_name');
                });

                // testing the "after" attribute of the <config-file> tag in config.xml
                it('should append new children to XML document tree in the correct order', function () {
                    const configfile_cfg = new ConfigParser(configfile_xml);
                    const platformJson = PlatformJson.load(plugins_dir, 'android');
                    const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                    munger.add_config_changes(configfile_cfg, true).save_all();
                    const am_file = fs.readFileSync(path.join(temp, 'AndroidManifest.xml'), 'utf-8');
                    expect(am_file.indexOf('android:name="zoo"')).toBeLessThan(am_file.indexOf('android:name="com.foo.Bar"'));
                });

                it('should throw error for conflicting plugin config munge with config.xml config munge', function () {
                    install_plugin(editconfigplugin_two);

                    const platformJson = PlatformJson.load(plugins_dir, 'android');
                    platformJson.addInstalledPluginToPrepareQueue('org.test.editconfigtest_two', {}, true, true);

                    const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                    munger.add_config_changes(cfg, true);
                    expect(function () { munger.process(plugins_dir); }).toThrow(new Error('org.test.editconfigtest_two cannot be added. <edit-config> changes in this plugin conflicts with <edit-config> changes in config.xml. Conflicts must be resolved before plugin can be added.'));
                });
            });

            describe('of plist config files', function () {
                it('Test 023 : should write empty string nodes with no whitespace', function () {
                    fs.copySync(ios_config_xml, temp);
                    install_plugin(varplugin);

                    const platformJson = PlatformJson.load(plugins_dir, 'ios');
                    platformJson.addInstalledPluginToPrepareQueue('com.adobe.vars', {});
                    configChanges.process(plugins_dir, temp, 'ios', platformJson, pluginInfoProvider);
                    expect(fs.readFileSync(path.join(temp, 'SampleApp', 'SampleApp-Info.plist'), 'utf-8')).toMatch(/<key>APluginNode<\/key>\n\t<string\/>/m);
                });

                it('Test 024 : should merge dictionaries and arrays, removing duplicates', function () {
                    fs.copySync(ios_config_xml, temp);
                    install_plugin(plistplugin);

                    const platformJson = PlatformJson.load(plugins_dir, 'ios');
                    platformJson.addInstalledPluginToPrepareQueue('org.apache.plist', {});
                    configChanges.process(plugins_dir, temp, 'ios', platformJson, pluginInfoProvider);
                    expect(fs.readFileSync(path.join(temp, 'SampleApp', 'SampleApp-Info.plist'), 'utf-8')).toMatch(/<key>UINewsstandIcon<\/key>[\s\S]*<key>CFBundlePrimaryIcon<\/key>/);
                    expect(fs.readFileSync(path.join(temp, 'SampleApp', 'SampleApp-Info.plist'), 'utf-8')).toMatch(/<string>schema-b<\/string>/);
                    expect(fs.readFileSync(path.join(temp, 'SampleApp', 'SampleApp-Info.plist'), 'utf-8')).not.toMatch(/(<string>schema-a<\/string>[^]*){2,}/);
                });
            });

            describe('of binary plist config files', function () {
                it('should merge dictionaries and arrays, removing duplicates', function () {
                    fs.copySync(ios_config_xml, temp);
                    install_plugin(bplistplugin);

                    const platformJson = PlatformJson.load(plugins_dir, 'ios');
                    platformJson.addInstalledPluginToPrepareQueue('org.apache.bplist', {});
                    configChanges.process(plugins_dir, temp, 'ios', platformJson, pluginInfoProvider);
                    const edited_plist = fs.readFileSync(path.join(temp, 'SampleApp', 'SampleApp-binary.plist'), 'utf-8');
                    expect(edited_plist).toMatch(/<key>UINewsstandIcon<\/key>[\s\S]*<key>CFBundlePrimaryIcon<\/key>/);
                    expect(fs.readFileSync(path.join(temp, 'SampleApp', 'SampleApp-binary.plist'), 'utf-8')).toMatch(/<string>schema-b<\/string>/);
                    expect(fs.readFileSync(path.join(temp, 'SampleApp', 'SampleApp-binary.plist'), 'utf-8')).not.toMatch(/(<string>schema-a<\/string>[^]*){2,}/);
                });
            });

            it('Test 025 : should resolve wildcard config-file targets to the project, if applicable', function () {
                fs.copySync(ios_config_xml, temp);
                install_plugin(cbplugin);

                const platformJson = PlatformJson.load(plugins_dir, 'ios');
                platformJson.addInstalledPluginToPrepareQueue('org.test.plugins.childbrowser', {});
                const spy = spyOn(fs, 'readFileSync').and.callThrough();

                const munger = new configChanges.PlatformMunger('ios', temp, platformJson, pluginInfoProvider);
                munger.process(plugins_dir);
                expect(spy).toHaveBeenCalledWith(path.join(temp, 'SampleApp', 'SampleApp-Info.plist'), 'utf8');
            });

            it('Test 026 : should move successfully installed plugins from queue to installed plugins section, and include/retain vars if applicable', function () {
                fs.copySync(android_two_project, temp);
                install_plugin(varplugin);

                const platformJson = PlatformJson.load(plugins_dir, 'android');
                platformJson.addInstalledPluginToPrepareQueue('com.adobe.vars', { API_KEY: 'hi' }, true);

                const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                munger.process(plugins_dir);

                expect(platformJson.root.prepare_queue.installed.length).toEqual(0);
                expect(platformJson.root.installed_plugins['com.adobe.vars']).toBeDefined();
                expect(platformJson.root.installed_plugins['com.adobe.vars'].API_KEY).toEqual('hi');
            });
        });

        describe(': uninstallation', function () {
            it('Test 027 : should call pruneXML for every config munge it completely removes from the app (every leaf that is decremented to 0)', function () {
                fs.copySync(android_two_project, temp);

                // Run through an "install"
                const platformJson = PlatformJson.load(plugins_dir, 'android');
                platformJson.addInstalledPluginToPrepareQueue('org.test.plugins.dummyplugin', {});
                const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                munger.process(plugins_dir);

                // Now set up an uninstall and make sure prunexml is called properly
                platformJson.addUninstalledPluginToPrepareQueue('org.test.plugins.dummyplugin');

                const spy = spyOn(xml_helpers, 'pruneXML').and.returnValue(true);
                munger.process(plugins_dir);
                expect(spy.calls.count()).toEqual(4);
                expect(spy.calls.argsFor(0)[2]).toEqual('/*');
                expect(spy.calls.argsFor(1)[2]).toEqual('/*');
                expect(spy.calls.argsFor(2)[2]).toEqual('/manifest/application');
                expect(spy.calls.argsFor(3)[2]).toEqual('/cordova/plugins');
            });

            it('Test 028 : should generate a config munge that interpolates variables into config changes, if applicable', function () {
                fs.copySync(android_two_project, temp);
                install_plugin(varplugin);

                // Run through an "install"
                const platformJson = PlatformJson.load(plugins_dir, 'android');
                platformJson.addInstalledPluginToPrepareQueue('com.adobe.vars', { API_KEY: 'canucks' });
                const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                munger.process(plugins_dir);

                // Now set up an uninstall and make sure prunexml is called properly
                platformJson.addUninstalledPluginToPrepareQueue('com.adobe.vars');

                const spy = spyOn(munger, 'generate_plugin_config_munge').and.returnValue({});
                munger.process(plugins_dir);

                const munge_params = spy.calls.argsFor(0);
                expect(munge_params[0]).toEqual(jasmine.any(PluginInfo));
                expect(munge_params[0].dir).toEqual(path.join(plugins_dir, 'com.adobe.vars'));
                expect(munge_params[1].API_KEY).toEqual('canucks');
            });

            it('Test 029 : should not call pruneXML for a config munge that another plugin depends on', function () {
                fs.copySync(android_two_no_perms_project, temp);
                install_plugin(childrenplugin);
                install_plugin(shareddepsplugin);

                // Run through and "install" two plugins (they share a permission for INTERNET)
                const platformJson = PlatformJson.load(plugins_dir, 'android');
                platformJson.addInstalledPluginToPrepareQueue('org.test.multiple-children', {});
                platformJson.addInstalledPluginToPrepareQueue('org.test.shareddeps', {});

                const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                munger.process(plugins_dir);

                // Now set up an uninstall for multi-child plugin
                platformJson.addUninstalledPluginToPrepareQueue('org.test.multiple-children');
                munger.process(plugins_dir);
                munger.save_all();

                const am_xml = new et.ElementTree(et.XML(fs.readFileSync(path.join(temp, 'AndroidManifest.xml'), 'utf-8')));
                const permission = am_xml.find('./uses-permission');
                expect(permission).toBeDefined();
                expect(permission.attrib['android:name']).toEqual('android.permission.INTERNET');
            });

            it('Test 030 : should not call pruneXML for a config munge targeting a config file that does not exist', function () {
                fs.copySync(android_two_project, temp);
                // install a plugin
                const platformJson = PlatformJson.load(plugins_dir, 'android');
                platformJson.addInstalledPluginToPrepareQueue('org.test.plugins.dummyplugin', {});
                const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                munger.process(plugins_dir);

                // set up an uninstall for the same plugin
                platformJson.addUninstalledPluginToPrepareQueue('org.test.plugins.dummyplugin');

                const spy = spyOn(fs, 'readFileSync').and.callThrough();
                munger.process(plugins_dir);

                expect(spy).not.toHaveBeenCalledWith(path.join(temp, 'res', 'xml', 'plugins.xml'), 'utf-8');
            });

            it('Test 031 : should remove uninstalled plugins from installed plugins list', function () {
                fs.copySync(android_two_project, temp);
                install_plugin(varplugin);

                // install the var plugin
                const platformJson = PlatformJson.load(plugins_dir, 'android');
                platformJson.addInstalledPluginToPrepareQueue('com.adobe.vars', { API_KEY: 'eat my shorts' });
                const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                munger.process(plugins_dir);

                // queue up an uninstall for the same plugin
                platformJson.addUninstalledPluginToPrepareQueue('com.adobe.vars');
                munger.process(plugins_dir);

                expect(platformJson.root.prepare_queue.uninstalled.length).toEqual(0);
                expect(platformJson.root.installed_plugins['com.adobe.vars']).not.toBeDefined();
            });

            it('Test 032 : should call pruneXMLRestore for every config munge with mode \'merge\' or \'overwrite\' it removes from the app', function () {
                fs.copySync(android_two_project, temp);
                install_plugin(editconfigplugin);

                // Run through an "install"
                const platformJson = PlatformJson.load(plugins_dir, 'android');
                platformJson.addInstalledPluginToPrepareQueue('org.test.editconfigtest', {});

                const munger = new configChanges.PlatformMunger('android', temp, platformJson, pluginInfoProvider);
                munger.process(plugins_dir);

                // Now set up an uninstall and make sure pruneXMLMerge is called properly
                platformJson.addUninstalledPluginToPrepareQueue('org.test.editconfigtest');

                const spy = spyOn(xml_helpers, 'pruneXMLRestore').and.returnValue(true);
                munger.process(plugins_dir);

                expect(spy.calls.count()).toEqual(2);
                expect(spy.calls.argsFor(0)[1]).toEqual('/manifest/application/activity[@android:name=\'org.test.DroidGap\']');
                expect(spy.calls.argsFor(1)[1]).toEqual('/manifest/application/activity');
            });
        });
    });
});
