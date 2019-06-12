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

var Q = require('q');
var path = require('path');
var superspawn = require('../src/superspawn');

var isWin32 = process.platform === 'win32';

var LS = isWin32 ? 'dir' : 'ls';

describe('spawn method', function () {
    var progressSpy, errorSpy;

    beforeEach(function () {
        progressSpy = jasmine.createSpy('progress');
        errorSpy = jasmine.createSpy('error');
    });

    it('Test 001 : should return a promise for a valid command', function () {
        expect(Q.isPromise(superspawn.spawn(LS))).toBe(true);
    });

    it('Test 002 : should return a promise that reports error for invalid command', function (done) {
        const promise = superspawn.spawn('invalid_command');
        expect(Q.isPromise(promise)).toBe(true);

        promise
            .progress(progressSpy)
            .catch(errorSpy)
            .fin(function () {
                if (!isWin32) {
                    expect(progressSpy).not.toHaveBeenCalled();
                }
                expect(errorSpy).toHaveBeenCalledWith(jasmine.any(Error));
                done();
            });
    });

    it('Test 003 : should notify about stdout "data" events', function (done) {
        superspawn.spawn(LS, [], { stdio: 'pipe' })
            .progress(progressSpy)
            .fin(function () {
                expect(progressSpy).toHaveBeenCalledWith({ 'stdout': jasmine.any(String) });
                done();
            });
    });

    it('Test 004 : should notify about stderr "data" events', function (done) {
        superspawn.spawn(LS, ['doesnt-exist'], { stdio: 'pipe' })
            .progress(progressSpy)
            .catch(errorSpy)
            .fin(function () {
                expect(progressSpy).toHaveBeenCalledWith({ 'stderr': jasmine.any(String) });
                expect(errorSpy).toHaveBeenCalledWith(jasmine.any(Error));
                done();
            });
    });

    it('Test 005 : reject handler should pass in Error object with stdout and stderr properties', function (done) {
        var cp = require('child_process');

        spyOn(cp, 'spawn').and.callFake(function (cmd, args, opts) {
            expect(cmd).toBeDefined();
            expect(args).toBeDefined();
            expect(opts).toBeDefined();

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

        superspawn.spawn('this aggression', ['will', 'not', 'stand', 'man'], {})
            .catch(function (err) {
                expect(err).toBeDefined();
                expect(err.stdout).toContain('usual');
                expect(err.stderr).toContain('mayday');
                done();
            });
    });

    it('Test 006 : inavlid cmd script should not throw but reject with error on non-Windows host', () => {
        if (isWin32) {
            pending('Test should not run on Windows');
        }

        // Our non-executable (as in no execute permission) script
        const TEST_SCRIPT = path.join(__dirname, 'fixtures/echo-args.cmd');

        let promise;
        expect(() => { promise = superspawn.spawn(TEST_SCRIPT, []); }).not.toThrow();

        return promise.then(() => {
            fail('Expected promise to be rejected');
        }).catch(err => {
            expect(err).toEqual(jasmine.any(Error));
            expect(err.code).toBe('EACCES');
        });
    });

    describe('cmd operation on windows', () => {
        const TEST_SCRIPT = path.join(__dirname, 'fixtures/echo-args.cmd');
        const TEST_ARGS = [ 'install', 'foo@^1.2.3', 'c o r d o v a' ];

        it('should escape arguments if `cmd` is not an *.exe', () => {
            if (!isWin32) {
                pending('test should only run on windows');
            }

            return superspawn.spawn(TEST_SCRIPT, TEST_ARGS).then(output => {
                expect(output.split(/\r?\n/)).toEqual(TEST_ARGS);
            });
        });
    });

});
