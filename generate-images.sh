node generate-images.js \
--from-csv-file "data/zinc_charged_wedges.csv" \
--from-csv-column "0" \
--output-directory "generated-images" \
--size "512"  \
--font-weights "400,800" \
--preserve-aspect-ratio "none" \
--concurrency "16" \
--label-type "points" \
--min-smiles-length "0" \
--max-smiles-length "500" \
--output-labels \
--amount "10000" \
--batch-size "250" \
--output-flat \
--clean "Cutive Mono" \
--fonts "Corinthia"