echo "uploading files"
rsync -azv -P \
  --exclude=.git \
  --exclude=.idea \
  --exclude=node_modules \
  --exclude=dumps \
  --whole-file \
  ~/code/repos/smilesDrawer "je7084@horeka.scc.kit.edu:~/code/repos"
echo "uploading files done"
