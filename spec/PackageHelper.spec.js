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

const os = require('osenv');
const path = require('path');
const rewire = require('rewire');
const writeFileAtomic = require('write-file-atomic');
const PackageHelper = rewire('../src/PackageHelper');

describe('PackageHelper', function () {
    describe('with no package.json', function () {
        let tempfile;
        /** @type PackageHelper */ let pkgHelper;

        beforeEach(function () {
            tempfile = path.join(os.tmpdir(), 'test.json');
            pkgHelper = new PackageHelper(tempfile);
        });

        it('should have no package name', function () {
            expect(pkgHelper.packageID).toBeUndefined();
        });

        it('should have no package version', function () {
            expect(pkgHelper.version).toBeUndefined();
        });

        it('should have no Cordova metadata', function () {
            expect(pkgHelper.cordova).toEqual({});
        });

        it('should have no platforms', function () {
            expect(pkgHelper.cordovaPlatforms).toEqual([]);
        });

        it('should have no plugins', function () {
            expect(pkgHelper.cordovaPlugins).toEqual([]);
        });

        it('should have no Cordova dependencies', function () {
            expect(pkgHelper.cordovaDependencies).toEqual({});
        });

        it('should return no variables for a non-installed plugin', function () {
            expect(pkgHelper.getPluginVariables('cordova-plugin-device')).toEqual({});
        });

        it('should write to the filesystem', function () {
            let stub = spyOn(writeFileAtomic, 'sync');

            pkgHelper.pkgfile.name = 'packageHelper-Test';
            pkgHelper.writeSync();
            expect(stub).toHaveBeenCalledWith(tempfile, '{\n  "name": "packageHelper-Test"\n}\n');
        });

        it('should write to the filesystem and return a promise', function () {
            let stub = jasmine.createSpy('writeFileAtomic').and.callFake(function (path, data, cb) {
                expect(path).toEqual(tempfile);
                expect(data).toEqual('{\n  "name": "packageHelper-Test"\n}\n');

                cb();
            });

            return PackageHelper.__with__({
                writeFileAtomic: stub
            })(function () {
                pkgHelper.pkgfile.name = 'packageHelper-Test';
                return pkgHelper.write();
            });
        });

        it('should add a platform', function () {
            pkgHelper.addPlatform('windows');

            expect(pkgHelper.cordovaPlatforms).toContain('windows');
        });

        it('should add a plugin with no vars', function () {
            pkgHelper.addPlugin('cordova-plugin-device');

            expect(pkgHelper.pkgfile.cordova.plugins).toEqual({ 'cordova-plugin-device': {} });
        });

        it('should add a plugin with vars', function () {
            pkgHelper.addPlugin('cordova-plugin-push', { FCM_TOKEN: 'foo' });

            expect(pkgHelper.pkgfile.cordova.plugins).toEqual({ 'cordova-plugin-push': { 'FCM_TOKEN': 'foo' } });
        });
    });

    describe('with a package.json', function () {
        const packageFile = path.join(__dirname, './fixtures/testpackage.json');
        /** @type PackageHelper */ let pkgHelper;

        beforeEach(function () {
            pkgHelper = new PackageHelper(packageFile);
        });

        it('should have no package name', function () {
            expect(pkgHelper.packageID).toEqual('TestProject');
        });

        it('should have no package version', function () {
            expect(pkgHelper.version).toEqual('1.0.0');
        });

        it('should have Cordova metadata', function () {
            expect(pkgHelper.cordova).not.toEqual({});
            expect(pkgHelper.cordova.platforms).not.toEqual([]);
            expect(pkgHelper.cordova.plugins).not.toEqual({});
        });

        it('should have 2 platforms', function () {
            expect(pkgHelper.cordovaPlatforms).toEqual(['android', 'cordova-amiga', 'ios']);
        });

        it('should have 2 plugins', function () {
            expect(pkgHelper.cordovaPlugins).toEqual(['cordova-plugin-device', 'cordova-plugin-push']);
        });

        it('should have find Cordova dependencies in dependencies', function () {
            expect(pkgHelper.cordovaDependencies['cordova-android']).toEqual('^7.0.0');
        });

        it('should have find Cordova dependencies in devDependencies', function () {
            expect(pkgHelper.cordovaDependencies['cordova-ios']).toEqual('~4.5.0');
            expect(pkgHelper.cordovaDependencies['cordova-plugin-device']).toEqual('*');
        });

        it('should prefer Cordova dependencies in devDependencies', function () {
            expect(pkgHelper.cordovaDependencies['cordova-amiga']).toEqual('0.0.5');
        });

        it('should return variables for a plugin', function () {
            expect(pkgHelper.getPluginVariables('cordova-plugin-device')).toEqual({});
            expect(pkgHelper.getPluginVariables('cordova-plugin-push')).toEqual({ FCM_TOKEN: '1234567890abcdef' });
        });

        it('should not add duplicate platforms', function () {
            let stub = spyOn(pkgHelper, 'write');

            pkgHelper.addPlatform('android');

            expect(pkgHelper.cordovaPlatforms).toContain('android');
            expect(stub).not.toHaveBeenCalled();
            expect(pkgHelper.modified).toBe(false);
        });

        it('should add a platform', function () {
            pkgHelper.addPlatform('windows');

            expect(pkgHelper.cordovaPlatforms).toEqual(['android', 'cordova-amiga', 'ios', 'windows']);
            expect(pkgHelper.modified).toBe(true);
        });

        it('should add a duplicate plugin with no vars', function () {
            pkgHelper.addPlugin('cordova-plugin-device');

            const expected = {
                'cordova-plugin-device': {},
                'cordova-plugin-push': {
                    'FCM_TOKEN': '1234567890abcdef'
                }
            };

            expect(pkgHelper.pkgfile.cordova.plugins).toEqual(expected);
        });

        it('should add a new plugin with no vars', function () {
            pkgHelper.addPlugin('cordova-plugin-file');

            const expected = {
                'cordova-plugin-device': {},
                'cordova-plugin-file': {},
                'cordova-plugin-push': {
                    'FCM_TOKEN': '1234567890abcdef'
                }
            };

            expect(pkgHelper.pkgfile.cordova.plugins).toEqual(expected);
            expect(pkgHelper.modified).toBe(true);
        });

        it('should add a duplicate plugin with non-conflicting vars', function () {
            pkgHelper.addPlugin('cordova-plugin-push', { FCM_TOKEN: '1234567890abcdef' });

            const expected = {
                'cordova-plugin-device': {},
                'cordova-plugin-push': {
                    'FCM_TOKEN': '1234567890abcdef'
                }
            };

            expect(pkgHelper.pkgfile.cordova.plugins).toEqual(expected);
            expect(pkgHelper.modified).toBe(false);
        });

        it('should add a duplicate plugin with conflicting vars', function () {
            pkgHelper.addPlugin('cordova-plugin-push', { FCM_TOKEN: 'hello_world' });

            const expected = {
                'cordova-plugin-device': {},
                'cordova-plugin-push': {
                    'FCM_TOKEN': 'hello_world'
                }
            };

            expect(pkgHelper.pkgfile.cordova.plugins).toEqual(expected);
            expect(pkgHelper.modified).toBe(true);
        });

        it('should write and preserve indentation and newlines', function () {
            let stub = jasmine.createSpy('writeFileAtomic').and.callFake(function (path, data, cb) {
                expect(path).toEqual(packageFile);
                expect(data).toMatch(/ {12}"cordova-plugin-push": {\r\n {16}"FCM_TOKEN": "hello_world"\r\n {12}},?\r\n/);

                cb();
            });

            return PackageHelper.__with__({
                writeFileAtomic: stub
            })(function () {
                pkgHelper.pkgfile.cordova.plugins['cordova-plugin-push']['FCM_TOKEN'] = 'hello_world';

                return pkgHelper.write(true);
            });
        });
    });
});
