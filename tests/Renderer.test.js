/* eslint-disable */
const misc = require('../src/generator/misc');
const Renderer = require('../src/generator/Renderer');

test('Creating a new Renderer instance works', () => {


    const argv = [
        'node', 'generate-images.js',
        '--from-csv-file=./tests/assets/test.csv',
        '--output-directory=./tests/assets/out',
        '--amount=3',
        '--size=1'
    ]

    // The renderer receives the cli params object directly as input
    const conf = misc.cliParams(argv);
    const renderer = new Renderer(conf);
    // just checking a few properties to confirm that object was constructed properly
    expect(renderer).toHaveProperty('size');
    expect(renderer).toHaveProperty('outputDirectory');
})

// Creating a renderer is a lot of boilerplate code so from this point on we use this function instead
function createRenderer(additionalArgv = []) {
    const argv = [...[
        'node', 'generate-images.js',
        '--from-csv-file=./tests/assets/test.csv',
        '--output-directory=./tests/assets/out',
        '--amount=3',
        '--size=1'
    ], ...additionalArgv]

    // The renderer receives the cli params object directly as input
    const conf = misc.cliParams(argv);
    return new Renderer(conf);
}

test('smiles to svg xml works', () => {
    const renderer = createRenderer();

    // the result of this method is supposed to be an xml string, but we mostly care that the method
    // completes without an error.
    const result = renderer.smilesToSvgXml('C[C@@H]1CC(Nc2cncc(-c3nncn3C)c2)C[C@@H](C)C1');
    expect(typeof result).toBe('string');
})

test('smiles to svg xml works with options override and no randomization', () => {
    const renderer = createRenderer([
        '--no-randomization',
        '--options-path=./tests/assets/options.js',
    ])

    const result = renderer.smilesToSvgXml('C[C@@H]1CC(Nc2cncc(-c3nncn3C)c2)C[C@@H](C)C1');
    expect(typeof result).toBe('string');
})