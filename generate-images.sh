node generate-images.js \
--from-csv-file "data/zinc_250k.csv" \
--from-csv-column "0" \
--amount "10" \
--output-directory "generated-images" \
--quality "1" \
--colors "mono" \
--scale "5" \
--concurrency "4" \
--label-type "hull"
