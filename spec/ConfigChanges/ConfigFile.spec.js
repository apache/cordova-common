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

var rewire = require('rewire');
var fs = require('fs-extra');
var path = require('path');
const readChunk = require('read-chunk');

describe('ConfigFile tests', function () {
    let ConfigFile;
    beforeEach(() => {
        ConfigFile = rewire('../../src/ConfigChanges/ConfigFile');
    });

    describe('instance methods', () => {
        describe('save', () => {
            it('calls fs.writeFileSync', function () {
                spyOn(fs, 'writeFileSync');
                ConfigFile.prototype.save();
                expect(fs.writeFileSync).toHaveBeenCalled();
            });
        });
    });

    describe('static methods', () => {
        describe('isBinaryPlist', () => {
            it('should return false if not binary', function () {
                spyOn(readChunk, 'sync').and.returnValue('not bplist');
                expect(ConfigFile.isBinaryPlist('someFile')).toBe(false);
            });

            it('should return true if binary', function () {
                spyOn(readChunk, 'sync').and.returnValue('bplist');
                expect(ConfigFile.isBinaryPlist('someFile')).toBe(true);
            });
        });

        describe('getIOSProjectname', () => {
            it('should throw error', function () {
                expect(function () { ConfigFile.getIOSProjectname('some/project/name'); }).toThrow();
            });
        });

        describe('resolveConfigFilePath', () => {
            const projectDir = path.join('project_dir', 'app', 'src', 'main');

            it('should return file path', function () {
                var filePath = path.join('project_dir', 'file');
                expect(ConfigFile.resolveConfigFilePath('project_dir', 'platform', 'file')).toBe(filePath);
            });

            it('should return AndroidManifest.xml file path', function () {
                var androidManifestPath = path.join(projectDir, 'AndroidManifest.xml');
                expect(ConfigFile.resolveConfigFilePath('project_dir', 'android', 'AndroidManifest.xml')).toBe(androidManifestPath);
            });

            it('should return android config.xml file path', function () {
                var configPath = path.join(projectDir, 'res', 'xml', 'config.xml');
                expect(ConfigFile.resolveConfigFilePath('project_dir', 'android', 'config.xml')).toBe(configPath);
            });

            it('should return android strings.xml file path', function () {
                var stringsPath = path.join(projectDir, 'res', 'values', 'strings.xml');
                expect(ConfigFile.resolveConfigFilePath('project_dir', 'android', 'strings.xml')).toBe(stringsPath);
            });

            it('should return ios config.xml file path', function () {
                spyOn(ConfigFile, 'getIOSProjectname').and.returnValue('iospath');
                var configPath = path.join('project_dir', 'iospath', 'config.xml');
                expect(ConfigFile.resolveConfigFilePath('project_dir', 'ios', 'config.xml')).toBe(configPath);
            });

            it('should return osx config.xml file path', function () {
                spyOn(ConfigFile, 'getIOSProjectname').and.returnValue('osxpath');
                var configPath = path.join('project_dir', 'osxpath', 'config.xml');
                expect(ConfigFile.resolveConfigFilePath('project_dir', 'osx', 'config.xml')).toBe(configPath);
            });

            it('should return android resource file path when path is normalized', function () {
                var file = path.join('res', 'xml');
                var configPath = path.join('project_dir', 'app', 'src', 'main', file, 'xml');
                expect(ConfigFile.resolveConfigFilePath('project_dir', 'android', file)).toBe(configPath);
            });

            it('should return android resource file path when path is not normalized', function () {
                var file = 'res/xml';
                var configPath = path.join('project_dir', 'app', 'src', 'main', file, 'xml');
                expect(ConfigFile.resolveConfigFilePath('project_dir', 'android', file)).toBe(configPath);
            });
        });
    });
});
