node generate-images.js \
--from-csv-file "data/drugbank.csv" \
--from-csv-column "0" \
--output-directory "generated-images" \
--quality "1" \
--colors "mono" \
--scale "3" \
--concurrency "4" \
--amount "30" \
--label-type "hull"
