/* This file is a part of @mdn/browser-compat-data
 * See LICENSE file for more information. */

import { CompatData, BrowserName } from '../../types/types.js';
import {
  InternalSupportStatement,
  InternalSupportBlock,
} from '../../types/index.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import esMain from 'es-main';
import { fdir } from 'fdir';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import stringify from 'fast-json-stable-stringify';

import bcd from '../../index.js';
import { walk } from '../../utils/index.js';
import mirrorSupport from '../release/mirror.js';

const dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Check to see if the statement is equal to the mirrored statement
 *
 * @param {InternalSupportBlock} support The support statement to test
 * @param {BrowserName} browser The browser to mirror for
 * @returns {boolean} Whether the support statement is equal to mirroring
 */
export const isMirrorEquivalent = (
  support: InternalSupportBlock,
  browser: BrowserName,
): boolean => {
  const original = support[browser];
  if (!original) {
    return false; // No data for browser.
  }
  if (original === 'mirror') {
    return false; // Already mirrored.
  }
  let mirrored;
  try {
    mirrored = mirrorSupport(browser, support);
  } catch (e) {
    // This can happen with missing engine_version. Don't mirror anything.
    return false;
  }
  if (stringify(mirrored) !== stringify(original)) {
    return false;
  }
  return true;
};

/**
 * Set the support statement for each browser to mirror if it matches mirroring
 *
 * @param {CompatData} bcd The compat data to update
 * @param {BrowserName[]} browsers The browsers to test
 */
export const mirrorIfEquivalent = (
  bcd: CompatData,
  browsers: BrowserName[],
): void => {
  for (const { compat } of walk(undefined, bcd)) {
    for (const browser of browsers) {
      if (isMirrorEquivalent(compat.support, browser)) {
        (compat.support[browser] as InternalSupportStatement) = 'mirror';
      }
    }
  }
};

/**
 * Update compat data to 'mirror' if the statement matches mirroring
 *
 * @param {string} filename The name of the file to update
 * @param {BrowserName[]} browsers The browsers to update
 */
const updateInPlace = (filename: string, browsers: BrowserName[]): void => {
  const actual = fs.readFileSync(filename, 'utf-8').trim();
  const bcd = JSON.parse(actual);
  mirrorIfEquivalent(bcd, browsers);
  const expected = JSON.stringify(bcd, null, 2);

  if (actual !== expected) {
    fs.writeFileSync(filename, expected + '\n', 'utf-8');
  }
};

if (esMain(import.meta)) {
  const defaultBrowsers = (
    Object.keys(bcd.browsers) as (keyof typeof bcd.browsers)[]
  ).filter((browser) => bcd.browsers[browser].upstream);

  const defaultFolders = [
    'api',
    'css',
    'html',
    'http',
    'svg',
    'javascript',
    'mathml',
    'webdriver',
    'webextensions',
  ];

  const { argv } = yargs(hideBin(process.argv)).command(
    '$0',
    'Replace support statements with "mirror" where equivalent',
    (yargs) => {
      yargs
        .option('browsers', {
          describe:
            'The browsers to attempt migration for. A support statement will only be update if all of the browsers can be mirrored.',
          type: 'array',
          default: defaultBrowsers,
        })
        .option('folders', {
          describe: 'The folders to attempt migration for.',
          type: 'array',
          default: defaultFolders,
        });
    },
  );

  for (const dir of (argv as any).folders) {
    const files = new fdir()
      .withBasePath()
      .filter((fp) => fp.endsWith('.json'))
      .crawl(path.join(dirname, '..', '..', dir))
      .sync();
    for (const file of files as string[]) {
      updateInPlace(file, (argv as any).browsers);
    }
  }
}
