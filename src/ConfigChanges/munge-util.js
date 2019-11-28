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

// add the count of [key1][key2]...[keyN] to obj
// return true if it didn't exist before
exports.deep_add = (...args) => {
    const { element, siblings } = processArgs(...args, { create: true });
    const matchingSibling = siblings.find(sibling => sibling.xml === element.xml);

    if (matchingSibling) {
        matchingSibling.after = matchingSibling.after || element.after;
        matchingSibling.count += element.count;
    } else {
        siblings.push(element);
    }

    return !matchingSibling;
};

// decrement the count of [key1][key2]...[keyN] from obj and remove if it reaches 0
// return true if it was removed or not found
exports.deep_remove = (...args) => {
    const { element, siblings } = processArgs(...args);
    const index = siblings.findIndex(sibling => sibling.xml === element.xml);

    if (index < 0) return true;

    const matchingSibling = siblings[index];

    if (matchingSibling.oldAttrib) {
        element.oldAttrib = Object.assign({}, matchingSibling.oldAttrib);
    }
    matchingSibling.count -= element.count;

    if (matchingSibling.count > 0) return false;

    siblings.splice(index, 1);
    return true;
};

// search for [key1][key2]...[keyN]
// return the object or undefined if not found
exports.deep_find = (...args) => {
    const { element, siblings } = processArgs(...args);

    const elementXml = (element.xml || element);
    return siblings.find(sibling => sibling.xml === elementXml);
};

function processArgs (obj, fileName, selector, element, opts) {
    if (Array.isArray(fileName)) {
        opts = selector;
        [fileName, selector, element] = fileName;
    }

    const siblings = getElements(obj, [fileName, selector], opts);
    return { element, siblings };
}

// Get the element array for given keys
// If a key entry is missing, create it if opts.create is true else return []
function getElements ({ files }, [fileName, selector], opts = { create: false }) {
    if (!files[fileName] && !opts.create) return [];

    const { parents: fileChanges } = (files[fileName] = files[fileName] || { parents: {} });
    if (!fileChanges[selector] && !opts.create) return [];

    return (fileChanges[selector] = fileChanges[selector] || []);
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

function mungeItems (base, { files }, mungeOperation) {
    const diff = { files: {} };

    for (const file in files) {
        for (const selector in files[file].parents) {
            for (const element of files[file].parents[selector]) {
                // if node not in base, add it to diff and base
                // else increment it's value in base without adding to diff

                const hasChanges = mungeOperation(base, [file, selector, element]);
                if (hasChanges) exports.deep_add(diff, [file, selector, element]);
            }
        }
    }

    return diff;
}

// For better readability where used
exports.clone_munge = munge => exports.increment_munge({}, munge);
