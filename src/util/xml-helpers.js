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

/**
 * contains XML utility functions, some of which are specific to elementtree
 */

const fs = require('fs-extra');
const path = require('path');
const _ = require('underscore');
const et = require('elementtree');
const stripBom = require('strip-bom');

const ROOT = /^\/([^/]*)/;
const ABSOLUTE = /^\/([^/]*)\/(.*)/;

module.exports = {
    // compare two et.XML nodes, see if they match
    // compares tagName, text, attributes and children (recursively)
    equalNodes: function (one, two) {
        if (
            (one.tag !== two.tag) ||
            (one.text.trim() !== two.text.trim()) ||
            (one._children.length !== two._children.length) ||
            !attribMatch(one, two)
        ) return false;

        for (let i = 0; i < one._children.length; i++) {
            if (!module.exports.equalNodes(one._children[i], two._children[i])) {
                return false;
            }
        }

        return true;
    },

    // adds node to doc at selector, creating parent if it doesn't exist
    graftXML: function (doc, nodes, selector, after) {
        let parent = module.exports.resolveParent(doc, selector);

        if (!parent) {
            // Try to create the parent recursively if necessary
            try {
                const parentToCreate = et.XML('<' + path.basename(selector) + '/>');
                const parentSelector = path.dirname(selector);

                this.graftXML(doc, [parentToCreate], parentSelector);
            } catch (e) {
                return false;
            }

            parent = module.exports.resolveParent(doc, selector);

            if (!parent) return false;
        }

        nodes.forEach(node => {
            // check if child is unique first
            if (uniqueChild(node, parent)) {
                const children = parent.getchildren();
                const insertIdx = after ? findInsertIdx(children, after) : children.length;

                // TODO: replace with parent.insert after the bug in ElementTree is fixed
                parent.getchildren().splice(insertIdx, 0, node);
            }
        });

        return true;
    },

    // adds new attributes to doc at selector
    // Will only merge if attribute has not been modified already or --force is used
    graftXMLMerge: (doc, nodes, selector, xml) => _graftXMLOverwriteAndMerge(doc, nodes, selector, xml, false),

    // overwrite all attributes to doc at selector with new attributes
    // Will only overwrite if attribute has not been modified already or --force is used
    graftXMLOverwrite: (doc, nodes, selector, xml) => _graftXMLOverwriteAndMerge(doc, nodes, selector, xml, true),

    // removes node from doc at selector
    pruneXML: function (doc, nodes, selector) {
        const parent = module.exports.resolveParent(doc, selector);

        if (!parent) return false;

        nodes.forEach(node => {
            const matchingKid = findChild(node, parent);

            // stupid elementtree takes an index argument it doesn't use
            // and does not conform to the python lib
            if (matchingKid !== undefined) parent.remove(matchingKid);
        });

        return true;
    },

    // restores attributes from doc at selector
    pruneXMLRestore: function (doc, selector, xml) {
        const target = module.exports.resolveParent(doc, selector);

        if (!target) return false;
        if (xml.oldAttrib) target.attrib = _.extend({}, xml.oldAttrib);

        return true;
    },

    pruneXMLRemove: function (doc, selector, nodes) {
        const target = module.exports.resolveParent(doc, selector);

        if (!target) return false;

        nodes.forEach(node => {
            for (const attribute in node.attrib) {
                if (target.attrib[attribute]) delete target.attrib[attribute];
            }
        });

        return true;
    },

    parseElementtreeSync: filename => new et.ElementTree(
        et.XML(stripBom(fs.readFileSync(filename, 'utf-8')))
    ),

    resolveParent: function (doc, selector) {
        if (!ROOT.test(selector)) return doc.find(selector);

        const tagName = selector.match(ROOT)[1];

        // test for wildcard "any-tag" root selector
        if (tagName === '*' || tagName === doc._root.tag) {
            // could be an absolute path, but not selecting the root, find sub selector from parent and return.
            if (ABSOLUTE.test(selector)) return doc._root.find(selector.match(ABSOLUTE)[2]);

            return doc._root;
        }

        return false;
    }
};

const _graftXMLOverwriteAndMerge = (doc, nodes, selector, xml, overwrite = false) => {
    const target = module.exports.resolveParent(doc, selector);

    if (!target) return false;

    // saves the attributes of the original xml before making changes
    xml.oldAttrib = _.extend({}, target.attrib);

    if (overwrite) {
        // remove old attributes from target
        for (const targetAttribute in target.attrib) {
            delete target.attrib[targetAttribute];
        }
    }

    nodes.forEach(node => {
        for (const attribute in node.attrib) {
            target.attrib[attribute] = node.attrib[attribute];
        }
    });

    return true;
};

const findChild = (node, parent) => parent.findall(node.tag).find(m => module.exports.equalNodes(node, m));
const uniqueChild = (node, parent) => !findChild(node, parent);

// Find the index at which to insert an entry. After is a ;-separated priority list
// of tags after which the insertion should be made. E.g. If we need to
// insert an element C, and the rule is that the order of children has to be
// As, Bs, Cs. After will be equal to "C;B;A".
function findInsertIdx (children, after) {
    const foundIndex = _.find(
        after
            .split(';')
            .map(current => children.map(child => child.tag).lastIndexOf(current)),
        index => index !== -1
    );

    // add to the beginning if no matching nodes are found
    return typeof foundIndex === 'undefined' ? 0 : foundIndex + 1;
}

const BLACKLIST = ['platform', 'feature', 'plugin', 'engine'];
const SINGLETONS = ['content', 'author', 'name'];

function mergeXml (src, dest, platform, clobber) {
    // Do nothing for blacklisted tags.
    if (BLACKLIST.includes(src.tag)) return;

    // Handle attributes
    Object.getOwnPropertyNames(src.attrib).forEach(attribute => {
        if (clobber || !dest.attrib[attribute]) dest.attrib[attribute] = src.attrib[attribute];
    });
    // Handle text
    if (src.text && (clobber || !dest.text)) dest.text = src.text;

    // Handle children
    src.getchildren().forEach(mergeChild);

    // Handle platform
    if (platform) {
        src.findall(`platform[@name="${platform}"]`).forEach(platformElement => {
            platformElement.getchildren().forEach(mergeChild);
        });
    }

    // Handle duplicate preference tags (by name attribute)
    removeDuplicatePreferences(dest);

    function mergeChild (srcChild) {
        const srcTag = srcChild.tag;
        const query = srcTag + '';
        let destChild = new et.Element(srcTag);
        let foundChild;
        let shouldMerge = true;

        if (BLACKLIST.includes(srcTag)) return;

        if (SINGLETONS.includes(srcTag)) {
            foundChild = dest.find(query);

            if (foundChild) {
                destChild = foundChild;
                dest.remove(destChild);
            }
        } else {
            // Check for an exact match and if you find one don't add
            const mergeCandidates = dest.findall(query)
                .filter(foundChild => foundChild && textMatch(srcChild, foundChild) && attribMatch(srcChild, foundChild));

            if (mergeCandidates.length > 0) {
                destChild = mergeCandidates[0];
                dest.remove(destChild);
                shouldMerge = false;
            }
        }

        mergeXml(srcChild, destChild, platform, clobber && shouldMerge);
        dest.append(destChild);
    }

    function removeDuplicatePreferences (xml) {
        // reduce preference tags to a hashtable to remove dupes
        const prefHash = xml.findall('preference[@name][@value]').reduce((previousValue, currentValue) => {
            previousValue[currentValue.attrib.name] = currentValue.attrib.value;
            return previousValue;
        }, {});

        // remove all preferences
        xml.findall('preference[@name][@value]').forEach(pref => {
            xml.remove(pref);
        });

        // write new preferences
        Object.keys(prefHash).forEach(function (key) {
            const element = et.SubElement(xml, 'preference');
            element.set('name', key);
            element.set('value', this[key]);
        }, prefHash);
    }
}

// Expose for testing.
module.exports.mergeXml = mergeXml;

function textMatch (elm1, elm2) {
    const format = text => text ? text.replace(/\s+/, '') : '';
    const text1 = format(elm1.text);
    const text2 = format(elm2.text);
    return (text1 === '' || text1 === text2);
}

function attribMatch (one, two) {
    const oneAttribKeys = Object.keys(one.attrib);
    const twoAttribKeys = Object.keys(two.attrib);

    if (oneAttribKeys.length !== twoAttribKeys.length) return false;

    for (let i = 0; i < oneAttribKeys.length; i++) {
        const name = oneAttribKeys[i];

        if (one.attrib[name] !== two.attrib[name]) return false;
    }

    return true;
}
