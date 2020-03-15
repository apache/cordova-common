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
const path = require('path');
const ActionStack = require('../src/ActionStack');
const android_one_project = path.join(__dirname, '..', 'projects', 'android_one');

describe('action-stack', function () {
    let stack;
    beforeEach(function () {
        stack = new ActionStack();
    });
    describe('processing of actions', function () {
        it('Test 001 : should process actions one at a time until all are done', function () {
            const first_spy = jasmine.createSpy();
            const first_args = [1];
            const second_spy = jasmine.createSpy();
            const second_args = [2];
            const third_spy = jasmine.createSpy();
            const third_args = [3];
            stack.push(stack.createAction(first_spy, first_args, function () {}, []));
            stack.push(stack.createAction(second_spy, second_args, function () {}, []));
            stack.push(stack.createAction(third_spy, third_args, function () {}, []));
            stack.process('android', android_one_project);
            expect(first_spy).toHaveBeenCalledWith(first_args[0]);
            expect(second_spy).toHaveBeenCalledWith(second_args[0]);
            expect(third_spy).toHaveBeenCalledWith(third_args[0]);
        });
        it('Test 002 : should revert processed actions if an exception occurs', function () {
            spyOn(console, 'log');
            const first_spy = jasmine.createSpy();
            const first_args = [1];
            const first_reverter = jasmine.createSpy();
            const first_reverter_args = [true];
            const process_err = new Error('process_err');
            const second_spy = jasmine.createSpy().and.callFake(function () {
                throw process_err;
            });
            const second_args = [2];
            const third_spy = jasmine.createSpy();
            const third_args = [3];
            stack.push(stack.createAction(first_spy, first_args, first_reverter, first_reverter_args));
            stack.push(stack.createAction(second_spy, second_args, function () {}, []));
            stack.push(stack.createAction(third_spy, third_args, function () {}, []));

            // process should throw
            return stack.process('android', android_one_project)
                .then(() => {
                    fail('Expected promise to be rejected');
                }, error => {
                    expect(error).toEqual(process_err);
                    // first two actions should have been called, but not the third
                    expect(first_spy).toHaveBeenCalledWith(first_args[0]);
                    expect(second_spy).toHaveBeenCalledWith(second_args[0]);
                    expect(third_spy).not.toHaveBeenCalledWith(third_args[0]);
                    // first reverter should have been called after second action exploded
                    expect(first_reverter).toHaveBeenCalledWith(first_reverter_args[0]);
                });
        });
    });
});
