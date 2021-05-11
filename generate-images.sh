node generate-images.js \
--from-csv-file "data/pubchem.csv" \
--from-csv-column "0" \
--output-directory "generated-images" \
--quality "100" \
--colors "mono" \
--size "512" \
--concurrency "8" \
--amount "10000" \
--label-type "points" \
--min-smiles-length "0" \
--max-smiles-length "1000" \
--output-labels \
--clean
