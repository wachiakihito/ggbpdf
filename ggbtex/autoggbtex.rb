# coding: utf-8
# Copyright (c) 2023 akihito wachi
# Released under the MIT license
# https:#opensource.org/licenses/mit-license.php

# ggbファイルの更新を監視して、変更される度に ggb->tex->dvi->pdf を作成する

TMPFILENAME = 'autoggbtex_tmp' # 出力ファイル名 (+これに拡張子)

#### ggbファイル名取得
if ARGV.empty? then
  puts 'usage: ruby autoggbtex.rb <file.ggb>'
  exit(1)
end
ggbfile = ARGV.shift

####
t = nil
loop {
  t1 = File.mtime(ggbfile)
  if t == t1 then
    sleep 0.5 
  else
    ret = system "ruby ggbtex.rb #{ggbfile} > #{TMPFILENAME}.tex"
    ret = system "platex #{TMPFILENAME}" if ret
    ret = system "dvipdfmx #{TMPFILENAME}" if ret
  end
  t = t1
}

