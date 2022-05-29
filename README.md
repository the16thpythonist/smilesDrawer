# SMILES to image
Use [generate-images.js](generate-images.js) to generate data. 
You need to install [node.js](https://nodejs.org/en) to run this tool.

Install dependencies using
```console
npm i
```

Parameter | Description
--- | --- 
`--from-csv-file` | Path to a CSV file. It can have one column only.
`--from-csv-column` | Specifies which column of CSV to read. Set to 0 for CVS with only one column.
`--output-directory` | Output directory.
`--quality` | Value in [0, 100] specifying image quality. Or 'random'.
`--colors` | Selects one of the [color](src/generator/colors.js) maps 
`--size` | Value specifying by how much the generated image should be resized.
`--preserve-aspect-ratio` | Documentation [here](https://developer.mozilla.org/de/docs/Web/SVG/Attribute/preserveAspectRatio).
`--amount` | How many SMILES to read.
`--concurrency` | How many headless browsers to start.
`--label-type` | One of ```box```, ```oriented```, ```points``` or ```all```.
`--min-smiles-length` | Lower bound for SMILES strings.
`--max-smiles-length` | Upper bound for SMILES strings.
`--output-labels` | Debug option. Whether to output labels.
`--output-svg` | Debug option. Whether to output raw SVG files.
`--clean` | Debug option. Whether to clean the target directory.
`--no-randomization` | Boolean flag. If given, image generation will *not* be randomized, but instead a static config will be used. 
`--option-path` | Path pointing to a `options.js` file which exports a single `options` function that will return an object which will overwrite the rendering options object

## Non-randomized example

By default, the created images are randomized in many aspects. To generate images without randomization 
use the `--no-randomization` flag. The `--option-path` parameter can additionally be used to overwrite the 
rendering options with custom values. To do this, point towards a javascript module file, which exports a 
single `options` callback function that returns the custom options object.

```console
node generate-images.js \
    --from-csv-file "data/zinc_charged_wedges.csv" \
    --output-directory "/tmp/images"
    --size "512" \
    --amount "10" \
    --no-randomization \
    --options-path "./options.js"
```

And the used `options.js` file can look like this:

```javascript
/* options.js */
module.exports = {
    options: ({ baseValue }) => { return {
        'bondLength': baseValue * 2,
        'shortBondLength': 0.7,
        'bondSpacing': baseValue * 0.3,
        'font': 'Roboto Mono',
        'fontWeight': '600',
        'fontSizeLarge': baseValue * 0.8,
        'fontSizeSmall': baseValue * 0.5,
        'padding': baseValue * 0.6,
    }}
}
```

## Running unittest

Install `jest` to run the unittests:

```console
npm install -g jest-cli
```

Run in the main directory:

```console
jest ./tests
```