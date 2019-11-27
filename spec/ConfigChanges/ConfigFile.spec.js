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
var configFile = rewire('../../src/ConfigChanges/ConfigFile');
var fs = require('fs-extra');
var path = require('path');

describe('ConfigFile tests', function () {
    describe('instance methods', () => {
        describe('save', () => {
            it('calls fs.writeFileSync', function () {
                spyOn(fs, 'writeFileSync');
                configFile.prototype.save();
                expect(fs.writeFileSync).toHaveBeenCalled();
            });
        });
    });

    describe('static methods', () => {
        describe('isBinaryPlist', () => {
            it('should return false if not binary', function () {
                spyOn(fs, 'readFileSync').and.returnValue('not bplist');
                expect(configFile.isBinaryPlist('someFile')).toBe(false);
            });

            it('should return true if binary', function () {
                spyOn(fs, 'readFileSync').and.returnValue('bplist');
                expect(configFile.isBinaryPlist('someFile')).toBe(true);
            });
        });

        describe('getIOSProjectname', () => {
            it('should throw error', function () {
                expect(function () { configFile.getIOSProjectname('some/project/name'); }).toThrow();
            });
        });

        describe('resolveConfigFilePath', () => {
            const projectDir = path.join('project_dir', 'app', 'src', 'main');

            it('should return file path', function () {
                var filePath = path.join('project_dir', 'file');
                expect(configFile.resolveConfigFilePath('project_dir', 'platform', 'file')).toBe(filePath);
            });

            it('should return file path', function () {
                var androidManifestPath = path.join(projectDir, 'AndroidManifest.xml');
                expect(configFile.resolveConfigFilePath('project_dir', 'android', 'AndroidManifest.xml')).toBe(androidManifestPath);
            });

            it('should return file path', function () {
                var configPath = path.join(projectDir, 'res', 'xml', 'config.xml');
                expect(configFile.resolveConfigFilePath('project_dir', 'android', 'config.xml')).toBe(configPath);
            });

            it('should return file path', function () {
                var stringsPath = path.join(projectDir, 'res', 'values', 'strings.xml');
                expect(configFile.resolveConfigFilePath('project_dir', 'android', 'strings.xml')).toBe(stringsPath);
            });

            it('should return file path', function () {
                spyOn(configFile, 'getIOSProjectname').and.returnValue('iospath');
                var configPath = path.join('project_dir', 'iospath', 'config.xml');
                expect(configFile.resolveConfigFilePath('project_dir', 'ios', 'config.xml')).toBe(configPath);
            });

            it('should return file path', function () {
                spyOn(configFile, 'getIOSProjectname').and.returnValue('osxpath');
                var configPath = path.join('project_dir', 'osxpath', 'config.xml');
                expect(configFile.resolveConfigFilePath('project_dir', 'osx', 'config.xml')).toBe(configPath);
            });

            it('should return file path', function () {
                var file = path.join('res', 'xml');
                var configPath = path.join('project_dir', 'app', 'src', 'main', file, 'xml');
                expect(configFile.resolveConfigFilePath('project_dir', 'android', file)).toBe(configPath);
            });

            it('should return file path', function () {
                var file = 'res/xml';
                var configPath = path.join('project_dir', 'app', 'src', 'main', file, 'xml');
                expect(configFile.resolveConfigFilePath('project_dir', 'android', file)).toBe(configPath);
            });
        });
    });
});
