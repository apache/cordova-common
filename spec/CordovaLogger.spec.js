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

const CordovaError = require('../src/CordovaError');
const CordovaLogger = require('../src/CordovaLogger');
const EventEmitter = require('events').EventEmitter;

const DEFAULT_LEVELS = ['verbose', 'normal', 'warn', 'info', 'error', 'results'];

describe('CordovaLogger class', function () {
    it('Test 001 : should be constructable', function () {
        expect(new CordovaLogger()).toEqual(jasmine.any(CordovaLogger));
    });

    it('Test 002 : should expose default levels as constants', function () {
        DEFAULT_LEVELS.forEach(function (level) {
            const constant = level.toUpperCase();
            expect(CordovaLogger[constant]).toBeDefined();
            expect(CordovaLogger[constant]).toBe(level);
        });
    });

    it('Test 003 : should return the same instance via "get" method', function () {
        expect(CordovaLogger.get()).toBeDefined();
        expect(CordovaLogger.get()).toBe(CordovaLogger.get());
        expect(CordovaLogger.get()).toEqual(jasmine.any(CordovaLogger));
    });

    describe('instance', function () {
        let logger;

        beforeEach(function () {
            logger = new CordovaLogger();
        });

        it('Test 004 : should have defaults levels', function () {
            DEFAULT_LEVELS.forEach(function (level) {
                expect(logger.levels[level]).toBeDefined();
                expect(logger.levels[level]).toEqual(jasmine.any(Number));
                expect(logger[level]).toBeDefined();
                expect(logger[level]).toEqual(jasmine.any(Function));
                expect(logger[level].length).toBe(1);
            });
        });

        describe('addLevel method', function () {
            it('Test 005 : should add a new level and a corresponding shortcut method', function () {
                spyOn(logger, 'log');
                logger.addLevel('debug', 100000, 'grey');
                expect(logger.levels.debug).toBe(100000);
                expect(logger.debug).toEqual(jasmine.any(Function));

                logger.debug('debug message');
                expect(logger.log).toHaveBeenCalledWith('debug', 'debug message');
            });

            it('Test 006 : should not add a shortcut method fi the property with the same name already exists', function () {
                const logMethod = logger.log;
                logger.addLevel('log', 500);
                expect(logger.log).toBe(logMethod); // "log" method remains unchanged
            });
        });

        describe('setLevel method', function () {
            it('Test 007 : should set logger\'s level to \'NORMAL\' if provided level does not exist', function () {
                logger.setLevel('debug');
                expect(logger.logLevel).toBe(CordovaLogger.NORMAL); // default value
            });
        });

        describe('subscribe method', function () {
            it('Test 008 : should throw if called without EventEmitter instance', function () {
                expect(function () { logger.subscribe(); }).toThrow();
                expect(function () { logger.subscribe(123); }).toThrow();
            });

            it('Test 009 : should attach corresponding listeners to supplied emitter', function () {
                const eventNamesExclusions = {
                    log: 'normal',
                    warning: 'warn'
                };

                const listenerSpy = jasmine.createSpy('listenerSpy')
                    .and.callFake(function (eventName) {
                        eventName = eventNamesExclusions[eventName] || eventName;
                        expect(logger.levels[eventName]).toBeDefined();
                    });

                const emitter = new EventEmitter().on('newListener', listenerSpy);
                logger.subscribe(emitter);
            });
        });

        describe('log method', function () {
            function CursorSpy (name) {
                const cursorMethods = ['reset', 'write', 'bold'];
                const spy = jasmine.createSpyObj(name, cursorMethods);

                // Make spy methods chainable, as original Cursor acts
                cursorMethods.forEach(function (method) { spy[method].and.returnValue(spy); });

                spy.fg = jasmine.createSpyObj('fg', ['grey', 'yellow', 'blue', 'red']);

                return spy;
            }

            beforeEach(function () {
                logger.stdoutCursor = new CursorSpy('stdoutCursor');
                logger.stderrCursor = new CursorSpy('stderrCursor');
            });

            it('Test 010 : should ignore message if severity is less than logger\'s level', function () {
                logger.setLevel('error').log('verbose', 'some_messgge');
                expect(logger.stdoutCursor.write).not.toHaveBeenCalled();
                expect(logger.stderrCursor.write).not.toHaveBeenCalled();
            });

            it('Test 011 : should log everything except error messages to stdout', function () {
                logger.setLevel('verbose');
                DEFAULT_LEVELS.forEach(function (level) {
                    logger.log(level, 'message');
                });

                // Multiply calls number to 2 because 'write' method is get called twice (with message and EOL)
                expect(logger.stdoutCursor.write.calls.count()).toBe((DEFAULT_LEVELS.length - 1) * 2);
                expect(logger.stderrCursor.write.calls.count()).toBe(1 * 2);
            });

            it('Test 012 : should log Error objects to stderr despite of loglevel', function () {
                logger.setLevel('verbose').log('verbose', new Error());
                expect(logger.stdoutCursor.write).not.toHaveBeenCalled();
                expect(logger.stderrCursor.write).toHaveBeenCalled();
            });

            it('Test 013 : should handle CordovaError instances separately from Error ones', function () {
                const errorMock = new CordovaError();
                spyOn(errorMock, 'toString').and.returnValue('error_message');

                logger.setLevel('verbose').log('verbose', errorMock);
                expect(errorMock.toString).toHaveBeenCalled();
                expect(logger.stderrCursor.write.calls.argsFor(0)).toMatch('Error: error_message');
            });
        });

        describe('adjustLevel method', function () {
            it('Test 014 : should properly adjust log level', function () {
                const resetLogLevel = function () {
                    logger.setLevel('normal');
                };

                resetLogLevel();
                expect(logger.adjustLevel({ verbose: true }).logLevel).toEqual('verbose');

                resetLogLevel();
                expect(logger.adjustLevel(['--verbose']).logLevel).toEqual('verbose');

                resetLogLevel();
                expect(logger.adjustLevel({ silent: true }).logLevel).toEqual('error');

                resetLogLevel();
                expect(logger.adjustLevel(['--silent']).logLevel).toEqual('error');

                resetLogLevel();
                expect(logger.adjustLevel({ verbose: true, silent: true }).logLevel).toEqual('verbose');

                resetLogLevel();
                expect(logger.adjustLevel(['--verbose', '--silent']).logLevel).toEqual('verbose');

                resetLogLevel();
            });
        });
    });
});
