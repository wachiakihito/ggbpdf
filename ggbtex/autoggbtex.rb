# coding: utf-8
TMPFILENAME = 'autoggbtex_tmp'

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

