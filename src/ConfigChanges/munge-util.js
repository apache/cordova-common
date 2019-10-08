/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
*/

const _ = require('underscore');

// add the count of [key1][key2]...[keyN] to obj
// return true if it didn't exist before
exports.deep_add = function deep_add (obj, keys /* or key1, key2 .... */) {
    if (!Array.isArray(keys)) {
        keys = Array.prototype.slice.call(arguments, 1);
    }

    return process_munge(obj, true/* createParents */, (parentArray, k) => {
        const found = _.find(parentArray, element => element.xml === k.xml);

        if (found) {
            found.after = found.after || k.after;
            found.count += k.count;
        } else {
            parentArray.push(k);
        }

        return !found;
    }, keys);
};

// decrement the count of [key1][key2]...[keyN] from obj and remove if it reaches 0
// return true if it was removed or not found
exports.deep_remove = function deep_remove (obj, keys /* or key1, key2 .... */) {
    if (!Array.isArray(keys)) {
        keys = Array.prototype.slice.call(arguments, 1);
    }

    const result = process_munge(obj, false/* createParents */, (parentArray, k) => {
        let index = -1;
        const found = _.find(parentArray, element => {
            index++;
            return element.xml === k.xml;
        });
        if (found) {
            if (parentArray[index].oldAttrib) {
                k.oldAttrib = _.extend({}, parentArray[index].oldAttrib);
            }
            found.count -= k.count;
            if (found.count > 0) {
                return false;
            } else {
                parentArray.splice(index, 1);
            }
        }
        return undefined;
    }, keys);

    return typeof result === 'undefined' ? true : result;
};

// search for [key1][key2]...[keyN]
// return the object or undefined if not found
exports.deep_find = function deep_find (obj, keys /* or key1, key2 .... */) {
    if (!Array.isArray(keys)) {
        keys = Array.prototype.slice.call(arguments, 1);
    }

    return process_munge(obj, false/* createParents? */, (parentArray, k) => {
        return _.find(parentArray, element => element.xml === (k.xml || k));
    }, keys);
};

// Execute func passing it the parent array and the xmlChild key.
// When createParents is true, add the file and parent items  they are missing
// When createParents is false, stop and return undefined if the file and/or parent items are missing

function process_munge (obj, createParents, func, keys /* or key1, key2 .... */) {
    if (!Array.isArray(keys)) {
        keys = Array.prototype.slice.call(arguments, 1);
    }
    const k = keys[0];
    if (keys.length === 1) {
        return func(obj, k);
    } else if (keys.length === 2) {
        if (!obj.parents[k] && !createParents) {
            return undefined;
        }
        obj.parents[k] = obj.parents[k] || [];
        return process_munge(obj.parents[k], createParents, func, keys.slice(1));
    } else if (keys.length === 3) {
        if (!obj.files[k] && !createParents) {
            return undefined;
        }
        obj.files[k] = obj.files[k] || { parents: {} };
        return process_munge(obj.files[k], createParents, func, keys.slice(1));
    } else {
        throw new Error('Invalid key format. Must contain at most 3 elements (file, parent, xmlChild).');
    }
}

// All values from munge are added to base as
// base[file][selector][child] += munge[file][selector][child]
// Returns a munge object containing values that exist in munge
// but not in base.
exports.increment_munge = (base, munge) => {
    return mungeItems(base, munge, exports.deep_add);
};

// Update the base munge object as
// base[file][selector][child] -= munge[file][selector][child]
// nodes that reached zero value are removed from base and added to the returned munge
// object.
exports.decrement_munge = (base, munge) => {
    return mungeItems(base, munge, exports.deep_remove);
};

function mungeItems (base, munge, mungeOperation) {
    const diff = { files: {} };

    for (const file in munge.files) {
        for (const selector in munge.files[file].parents) {
            for (const xml_child in munge.files[file].parents[selector]) {
                const val = munge.files[file].parents[selector][xml_child];
                // if node not in base, add it to diff and base
                // else increment it's value in base without adding to diff

                const hasChanges = mungeOperation(base, [file, selector, element]);

                if (hasChanges) {
                    exports.deep_add(diff, file, selector, val);
                }
            }
        }
    }

    return diff;
}

// For better readability where used
exports.clone_munge = munge => exports.increment_munge({}, munge);
