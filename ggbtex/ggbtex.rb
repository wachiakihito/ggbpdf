# -*- coding: utf-8; mode: ruby; mode: outline-minor -*-
# Copyright (c) 2023 akihito wachi
# Released under the MIT license
# https://opensource.org/licenses/mit-license.php

# usage: ruby ggbtex.rb file.ggb
# ggbファイルを読んで、簡単な空間図形をtexのpicture環境で出力する

require './lib_hlr3.rb'
require './parseggb.rb'

HEADER = <<EOS
\\documentclass[a4paper,landscape]{jarticle}
\\usepackage[margin=0pt]{geometry}
\\usepackage[dvipdfmx]{curve2e}
\\begin{document}
\\unitlength=%smm
EOS

FOOTER = <<EOS
\\end{document}
EOS

#### main
## コマンドライン引数チェック
if ARGV.empty? then
  puts 'usage: $ ruby ggbtex.rb <file.ggb>'
  exit(1)
end

## ggbファイルを読む
ggbfilename = ARGV.shift
xml_str = read_ggb(ggbfilename)
xml_data = parse_xml(xml_str)

## 視点位置
(xZero, yZero, zZero), scale, (xAngle, zAngle) = get_camera(xml_data)
w, h, len = get_view_size(xml_data)

## 図形を読む
obj_cmd = get_ordered_objs(xml_data)
pts = get_pts(xml_data)
segs, polys = scan_objs(xml_data, *obj_cmd)

#### 投影
screenx = len * 3
eyex = len * 15
ofst = [xZero, yZero, zZero]

pts_3d = {}
pts.each {|lbl, (x, y, z)|
  pt = V.rotate_z(-zAngle*Math::PI/180, [x,y,z]).first
  pt = V.rotate_y(-xAngle*Math::PI/180, pt).first
  pts_3d[lbl] = V.add(pt*scale, ofst)
#  pts_3d[lbl] = V.add(V.scl(scale, pt), ofst)
}
segs_3d = segs.map {|lbl, (p0, p1)| [pts_3d[p0], pts_3d[p1]] }
polys_3d = polys.map {|lbl, ps| ps.map {|pt| pts_3d[pt] } }

#### 出力
# ヘッダ
unit = 50 # unitlength (mm)
puts HEADER % unit
# picture環境
Output.texPolyhedron(eyex, screenx, 0.05, true, segs_3d, polys_3d, true)
# フッタ
puts FOOTER
