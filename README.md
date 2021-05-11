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
`--quality` | Value in [0, 100] specifying image quality.
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



