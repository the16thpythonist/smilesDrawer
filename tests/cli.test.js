/* eslint-disable */
/**
 * This file uses JEST unittests to test some aspects of the command line
 */


test('unit tests generally work', () => {
    expect(true).toBe(true);
})

test('importing local modules works', () => {
    const misc = require('../src/generator/misc');
    expect(misc).toHaveProperty('cliParams');
})

test('setting random cli param to false works', () => {
    const misc = require('../src/generator/misc');
    const yargs = require('yargs/yargs');
    const { hideBin } = require('yargs/helpers');

    argv = [
        'node',
        'generate-images.js',
        '--from-csv-file=./tests/test.csv',
        '--output-directory=./tests/out',
        '--amount=3',
        '--size=1',
        // yargs actually directly converts this kind of parameter here very nicely as {"random": false}
        '--no-randomization'
    ];
    const args = yargs(hideBin(argv)).argv
    expect(args).toHaveProperty('randomization');
    expect(args['randomization']).toBe(false);

    const params = misc.cliParams(argv);
    // Testing if the most important ones are in there
    expect(params).toHaveProperty('csvFile');

    // Testing if the new one is in there
    expect(params).toHaveProperty('randomization');
    expect(params['randomization']).toBe(false);
})

test('random cli param works without explicitly specifying', () => {
    const misc = require('../src/generator/misc');

    // We modify the args here because those 4 ones are actually required
    argv = [
        'node',
        'generate-images.js',
        '--from-csv-file=./tests/test.csv',
        '--output-directory=./tests/out',
        '--amount=3',
        '--size=1',
    ];

    const params = misc.cliParams(argv);

    // Testing if the new one is in there. By default without explicitly passing the parameter not to
    // randomize, it should always be true
    expect(params).toHaveProperty('randomization');
    expect(params['randomization']).toBe(true);
})

test('options path cli parameter is working', () => {
    const misc = require('../src/generator/misc');
    const fs = require('fs');

    // We modify the args here because those 4 ones are actually required
    argv = [
        'node',
        'generate-images.js',
        '--from-csv-file=./tests/assets/test.csv',
        '--output-directory=./tests/assets/out',
        '--amount=3',
        '--size=1',
        '--no-random',
        '--options-path=./tests/assets/options.js'
    ];

    // Checking if the path gets properly loaded into the params object
    const params = misc.cliParams(argv);
    expect(params).toHaveProperty('optionsPath');
    expect(params['optionsPath']).toBeDefined();
    expect(fs.existsSync(params['optionsPath'])).toBe(true);

    // Now this path should refer to a JS file which contains the "options" object, which means that this
    // should work:
    const { options } = require(params['optionsPath']);
    expect(options({})).toHaveProperty('overlapSensitivity');
})

