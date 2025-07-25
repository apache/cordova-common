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

const fs = require('node:fs');
const PlatformJson = require('../src/PlatformJson');

const ModuleMetadata = PlatformJson.ModuleMetadata;
const FAKE_MODULE = {
    name: 'fakeModule',
    src: 'www/fakeModule.js',
    clobbers: [{ target: 'window.fakeClobber' }],
    merges: [{ target: 'window.fakeMerge' }],
    runs: true
};

describe('PlatformJson class', function () {
    it('Test 001 : should be constructable', function () {
        expect(new PlatformJson()).toEqual(jasmine.any(PlatformJson));
    });

    describe('instance', function () {
        let platformJson;
        let fakePlugin;

        beforeEach(function () {
            platformJson = new PlatformJson('/fake/path', 'android');
            fakePlugin = jasmine.createSpyObj('fakePlugin', ['getJsModules']);
            fakePlugin.id = 'fakeId';
            fakePlugin.version = '1.0.0';
            fakePlugin.getJsModules.and.returnValue([FAKE_MODULE]);
        });

        describe('addPluginMetadata method', function () {
            it('Test 002 : should not throw if root "modules" property is missing', function () {
                expect(function () {
                    platformJson.addPluginMetadata(fakePlugin);
                }).not.toThrow();
            });

            it('Test 003 : should add each module to "root.modules" array', function () {
                platformJson.addPluginMetadata(fakePlugin);
                expect(platformJson.root.modules.length).toBe(1);
                expect(platformJson.root.modules[0]).toEqual(jasmine.any(ModuleMetadata));
            });

            it('Test 004 : shouldn\'t add module if there is already module with the same file added', function () {
                platformJson.root.modules = [{
                    name: 'fakePlugin2',
                    file: 'plugins/fakeId/www/fakeModule.js'
                }];

                platformJson.addPluginMetadata(fakePlugin);
                expect(platformJson.root.modules.length).toBe(1);
                expect(platformJson.root.modules[0].name).toBe('fakePlugin2');
            });

            it('Test 005 : should add entry to plugin_metadata with corresponding version', function () {
                platformJson.addPluginMetadata(fakePlugin);
                expect(platformJson.root.plugin_metadata[fakePlugin.id]).toBe(fakePlugin.version);
            });
        });

        describe('removePluginMetadata method', function () {
            it('Test 006 : should not throw if root "modules" property is missing', function () {
                expect(function () {
                    platformJson.removePluginMetadata(fakePlugin);
                }).not.toThrow();
            });

            it('Test 007 : should remove plugin modules from "root.modules" array based on file path', function () {
                const pluginPaths = [
                    'plugins/fakeId/www/fakeModule.js',
                    'plugins/otherPlugin/www/module1.js',
                    'plugins/otherPlugin/www/module1.js'
                ];

                platformJson.root.modules = pluginPaths.map(function (p) { return { file: p }; });
                platformJson.removePluginMetadata(fakePlugin);
                const resultantPaths = platformJson.root.modules
                    .map(function (p) { return p.file; })
                    .filter(function (f) { return /fakeModule\.js$/.test(f); });

                expect(resultantPaths.length).toBe(0);
            });

            it('Test 008 : should remove entry from plugin_metadata with corresponding version', function () {
                platformJson.root.plugin_metadata = {};
                platformJson.root.plugin_metadata[fakePlugin.id] = fakePlugin.version;
                platformJson.removePluginMetadata(fakePlugin);
                expect(platformJson.root.plugin_metadata[fakePlugin.id]).not.toBeDefined();
            });
        });

        function evaluateCordovaDefineStatement (str) {
            expect(typeof str).toBe('string');
            const fnString = str.replace(/^\s*cordova\.define\('cordova\/plugin_list',\s*([\s\S]+)\);\s*$/, '($1)');
            const mod = { exports: {} };
            global.eval(fnString)(null, mod.exports, mod); // eslint-disable-line no-eval
            return mod;
        }

        function expectedMetadata () {
            // Create plain objects from ModuleMetadata instances
            const modules = platformJson.root.modules.map(o => Object.assign({}, o));
            modules.metadata = platformJson.root.plugin_metadata;
            return modules;
        }

        describe('generateMetadata method', function () {
            it('Test 009 : should generate text metadata containing list of installed modules', function () {
                const meta = platformJson.addPluginMetadata(fakePlugin).generateMetadata();
                const mod = evaluateCordovaDefineStatement(meta);

                expect(mod.exports).toEqual(expectedMetadata());
            });
        });

        describe('generateAndSaveMetadata method', function () {
            it('should save generated metadata', function () {
                const spy = spyOn(fs, 'writeFileSync');

                const dest = require('path').join(__dirname, 'test-destination');
                platformJson.addPluginMetadata(fakePlugin).generateAndSaveMetadata(dest);

                expect(spy).toHaveBeenCalledTimes(1);
                const [file, data] = spy.calls.argsFor(0);
                expect(file).toBe(dest);
                const mod = evaluateCordovaDefineStatement(data);
                expect(mod.exports).toEqual(expectedMetadata());
            });
        });
    });
});

describe('ModuleMetadata class', function () {
    it('Test 010 : should be constructable', function () {
        let meta;
        expect(function () {
            meta = new ModuleMetadata('fakePlugin', { src: 'www/fakeModule.js' });
        }).not.toThrow();
        expect(meta instanceof ModuleMetadata).toBeTruthy();
    });

    it('Test 011 : should throw if either pluginId or jsModule argument isn\'t specified', function () {
        expect(ModuleMetadata).toThrow();
        expect(() => new ModuleMetadata(null, {})).toThrow();
        expect(() => new ModuleMetadata('fakePlugin', {})).toThrow();
    });

    it('Test 012 : should guess module id either from name property of from module src', function () {
        expect(new ModuleMetadata('fakePlugin', { name: 'fakeModule' }).id).toMatch(/fakeModule$/);
        expect(new ModuleMetadata('fakePlugin', { src: 'www/fakeModule.js' }).id).toMatch(/fakeModule$/);
    });

    it('Test 013 : should read "clobbers" property from module', function () {
        expect(new ModuleMetadata('fakePlugin', { name: 'fakeModule' }).clobbers).not.toBeDefined();
        const metadata = new ModuleMetadata('fakePlugin', FAKE_MODULE);
        expect(metadata.clobbers).toEqual(jasmine.any(Array));
        expect(metadata.clobbers[0]).toBe(FAKE_MODULE.clobbers[0].target);
    });

    it('Test 014 : should read "merges" property from module', function () {
        expect(new ModuleMetadata('fakePlugin', { name: 'fakeModule' }).merges).not.toBeDefined();
        const metadata = new ModuleMetadata('fakePlugin', FAKE_MODULE);
        expect(metadata.merges).toEqual(jasmine.any(Array));
        expect(metadata.merges[0]).toBe(FAKE_MODULE.merges[0].target);
    });

    it('Test 015 : should read "runs" property from module', function () {
        expect(new ModuleMetadata('fakePlugin', { name: 'fakeModule' }).runs).not.toBeDefined();
        expect(new ModuleMetadata('fakePlugin', FAKE_MODULE).runs).toBe(true);
    });
});
