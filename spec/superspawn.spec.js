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

var path = require('path');
var superspawn = require('../src/superspawn');

var LS = process.platform === 'win32' ? 'dir' : 'ls';

describe('spawn method', function () {
    var progressSpy;

    beforeEach(function () {
        progressSpy = jasmine.createSpy('progress');
    });

    it('should resolve on success', () => {
        return expectAsync(superspawn.spawn(LS)).toBeResolved();
    });

    it('should reject on failure', () => {
        return expectAsync(superspawn.spawn('invalid_command')).toBeRejected();
    });

    it('Test 002 : should notify about stdout "data" events', () => {
        return superspawn.spawn(LS, [], { stdio: 'pipe' })
            .progress(progressSpy)
            .then(function () {
                expect(progressSpy).toHaveBeenCalledWith({ stdout: jasmine.any(String) });
            });
    });

    it('Test 003 : should notify about stderr "data" events', () => {
        return superspawn.spawn(LS, ['doesnt-exist'], { stdio: 'pipe' })
            .progress(progressSpy)
            .then(() => {
                fail('Expected promise to be rejected');
            }, () => {
                expect(progressSpy).toHaveBeenCalledWith({ stderr: jasmine.any(String) });
            });
    });

    it('Test 004 : reject handler should pass in Error object with stdout and stderr properties', () => {
        var cp = require('child_process');
        spyOn(cp, 'spawn').and.callFake(() => {
            return {
                stdout: {
                    setEncoding: function () {},
                    on: function (evt, handler) {
                        // some sample stdout output
                        handler('business as usual');
                    }
                },
                stderr: {
                    setEncoding: function () {},
                    on: function (evt, handler) {
                        // some sample stderr output
                        handler('mayday mayday');
                    }
                },
                on: function (evt, handler) {
                    // What's passed to handler here is the exit code, so we can control
                    // resolve/reject flow via this argument.
                    handler(1); // this will trigger error flow
                },
                removeListener: function () {}
            };
        });
        return superspawn.spawn('this aggression', ['will', 'not', 'stand', 'man'], {})
            .then(() => {
                fail('Expected promise to be rejected');
            }, err => {
                expect(err).toBeDefined();
                expect(err.stdout).toContain('usual');
                expect(err.stderr).toContain('mayday');
            });
    });

    it('Test 005 : should not throw but reject', () => {
        if (process.platform === 'win32') {
            pending('Test should not run on Windows');
        }

        // Our non-executable (as in no execute permission) script
        const TEST_SCRIPT = path.join(__dirname, 'fixtures/echo-args.cmd');

        let promise;
        expect(() => { promise = superspawn.spawn(TEST_SCRIPT, []); }).not.toThrow();

        return promise.then(() => {
            fail('Expected promise to be rejected');
        }, err => {
            expect(err).toEqual(jasmine.any(Error));
            expect(err.code).toBe('EACCES');
        });
    });

    describe('operation on windows', () => {
        const TEST_SCRIPT = path.join(__dirname, 'fixtures/echo-args.cmd');
        const TEST_ARGS = ['install', 'foo@^1.2.3', 'c o r d o v a'];

        it('should escape arguments if `cmd` is not an *.exe', () => {
            if (process.platform !== 'win32') {
                pending('test should only run on windows');
            }

            return superspawn.spawn(TEST_SCRIPT, TEST_ARGS).then(output => {
                expect(output.split(/\r?\n/)).toEqual(TEST_ARGS);
            });
        });
    });
});
