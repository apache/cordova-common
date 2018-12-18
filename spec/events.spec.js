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

const events = require('../src/events');

describe('Cordova events', function () {
    describe('emit method', function () {
        it('Test 001 : should emit events to a listener', function () {
            const logSpy = jasmine.createSpy('logSpy');
            events.on('log', logSpy);

            events.emit('log', 'a test message');
            expect(logSpy).toHaveBeenCalledWith('a test message');
        });

        it('Test 002 : should report if there were any listeners or not', function () {
            const r1 = events.emit('myname', 'first');
            expect(r1).toBe(false);

            const listenerSpy = jasmine.createSpy('listenerSpy');
            events.on('myname', listenerSpy);
            const r2 = events.emit('myname', 'second');
            expect(r2).toBe(true);
            expect(listenerSpy).toHaveBeenCalled();
        });
    });

    describe('forwardEventsTo method', function () {
        afterEach(function () {
            events.forwardEventsTo(null);
        });

        it('Test 003 : should forward events to another event emitter', function () {
            const EventEmitter = require('events').EventEmitter;
            const anotherEventEmitter = new EventEmitter();
            const logSpy = jasmine.createSpy('logSpy');
            anotherEventEmitter.on('log', logSpy);

            events.forwardEventsTo(anotherEventEmitter);
            events.emit('log', 'forwarding test message');
            expect(logSpy).toHaveBeenCalledWith('forwarding test message');
        });

        it('Test 004 : should not go to infinite loop when trying to forward to self', function () {
            expect(function () {
                events.forwardEventsTo(events);
                events.emit('log', 'test message');
            }).not.toThrow();
        });

        it('Test 005 : should reset forwarding after trying to forward to self', function () {
            const EventEmitter = require('events').EventEmitter;
            const anotherEventEmitter = new EventEmitter();
            const logSpy = jasmine.createSpy('logSpy');
            anotherEventEmitter.on('log', logSpy);

            // should forward events to another event emitter at this point
            events.forwardEventsTo(anotherEventEmitter);
            events.emit('log', 'test message #1');
            expect(logSpy).toHaveBeenCalledWith('test message #1');

            logSpy.calls.reset();

            // should *not* forward events to another event emitter at this point
            events.forwardEventsTo(events);
            events.emit('log', 'test message #2');
            expect(logSpy).not.toHaveBeenCalled();
        });
    });
});
