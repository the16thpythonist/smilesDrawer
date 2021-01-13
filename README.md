# SMILES to image
Use [generate-images.js](generate-images.js) to generate data. 
You need to install [node.js](https://nodejs.org/en) to run this tool.

Install dependencies using
```console
npm i
```

Example usage:
```bash
node generate-images.js \  
--from-csv-file "data/zinc_250k.csv" \ 
--from-csv-column "0" \
--file-prefix "image" \
--amount "100" \
--directory "generated-images" \
--quality "1" \
--colors "mono" \
--scale "5"
```


Parameter | Description
--- | --- 
`--from-csv-file` | Path to a CSV file. It can have one column only.
`--from-csv-column` | Specifies which column of CSV to read. Set to 0 for CVS with only one column.
`--file-prefix` | A prefix for output files.
`--amount` | How many SMILES to read.
`--directory` | Output directory.
`--quality` | Value in [0, 100] specifying image quality.
`--colors` | Selects one of the [color](src/generator/colors.js) maps 
`--scale` | Value specifying by how much the generated image should be resized.

