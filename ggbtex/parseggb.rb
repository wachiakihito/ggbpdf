# -*- coding: utf-8; mode: ruby; mode: outline-minor -*-
# Copyright (c) 2023 akihito wachi
# Released under the MIT license
# https://opensource.org/licenses/mit-license.php

# 3dのgeogberaのggbファイルを読み、必要な情報を構築する。

require 'rexml/document'

#### トポロジカルソート (TSort使わない版)
# 入力
# es = {x=>[xより小さい要素]}
# es のキーがすべての要素でなくてはならない
# es は破壊される
# 出力
# 要素を tsortした配列
def tsort(es)
  ans = []
  while ! es.empty?
    tsort_(es.first[0], es, ans)
  end
  ans
end

# tsortの下請け
def tsort_(x, es, ans)
  return if ! es.has_key?(x)
  es[x].each {|y|
    tsort_(y, es, ans) 
  }
  ans.push x
  es.delete x
end

#### ggbファイルを読み、geogebra.xmlを文字列で返す
def read_ggb(ggb_filename)
  # 存在チェック
  raise "Not exist: '#{ggb_filename}'" if ! FileTest.exist?(ggb_filename)
  # 展開
  res = `unzip -p #{ggb_filename} geogebra.xml`
  # エラーチェック
  raise $?.inspect if ! $?.exited?
  res
end

#### geogebra.xmlを文字列で与えると、REXML::Documentオブジェクトを返す (xmlデータと呼ぶ)
def parse_xml(xml_str)
  xml_data = REXML::Document.new(xml_str)
end

#### xmlデータを与えると、カメラの情報を返す
# [[xZero, yZero, zZero], scale, [xAngle, zAngle]] を返す (意味はreadme.txt)
# クリップ範囲は?
def get_camera(xml_data)
  attr = xml_data.get_elements('/geogebra/euclidianView3D/coordSystem').first.attributes
  pos = [attr['xZero'], attr['yZero'], attr['zZero']].map {|x| x.to_f }
  scale = attr['scale'].to_f
  angle = [attr['xAngle'], attr['zAngle']].map {|x| x.to_f }
  [pos, scale, angle]
end

#### xmlデータを与えると、3Dビューのサイズと、正のx軸の長さを返す
# 正のx軸の長さは、ビューの幅だけで決まるようで、幅 / scale * 0.35 くらい。
# これは、初期原点が移動していない場合に限るが、この長さを基準にカメラ
# やスクリーンの位置を決めるので問題はないだろう。
def get_view_size(xml_data)
  # 高さ
  h = REXML::XPath.match(xml_data, 'geogebra/euclidianView/size').first.
    attribute('height').to_s.to_i
  # 幅
  w = nil
  REXML::XPath.match(xml_data, 'geogebra/gui/perspectives/perspective/views/view').
    each {|elt|
    next if elt.attribute('id').to_s != '512'
    w = elt.attribute('size').to_s.to_i
    break
  }
  # 軸の長さ
  scale = xml_data.get_elements('/geogebra/euclidianView3D/coordSystem').first.
            attribute('scale').to_s.to_f
  len = w * 0.35 / scale
  [w, h, len]
end

#### xmlデータを与えると、依存関係順に全オブジェクトを並べた配列を返す
# 後の図形が先の図形に依存しているようなラベルの配列と、
# command要素を持つラベル=>command要素 のHashを返す。
def get_ordered_objs(xml_data)
  # 全ラベル収集
  h = {}
  res = {}
  REXML::XPath.each(xml_data, "geogebra/construction/element") {|elt|
    h[elt.attribute("label").to_s] = []
  }
  lbls = h.keys
  # 依存関係収集
  REXML::XPath.each(xml_data, "geogebra/construction/command") {|elt|
    input = elt.get_elements("input").first.attributes.map {|x| x.last }
    output = elt.get_elements("output").first.attributes.map {|x| x.last }
    # xAxisとか、点の直接指定の可能性があるので排除するためにlblsと共通部分
    output.each {|o| h[o] |= (input & lbls) }
    res[output.first] = elt
  }
#  [h.tsort, res]
  [tsort(h), res]
end

#### xmlデータを与えると、表示・非表示のHashを返す
# ラベル => true/false
# /geogebra/construction/element/show 要素の object属性にtrue/false
def get_visibility(xml_data)
  res = {}
  REXML::XPath.each(xml_data, "geogebra/construction/element") {|elt|
    lbl = elt.attribute("label").to_s
    show = elt.get_elements("show").first.attribute("object").to_s
    res[lbl] = (show=="true")
  }
  res
end

#### xmlデータを与えると、線分・直線・半直線の属性のHashを返す
# ラベル => dashとか太さとかの配列かStructか
def get_seg_attr(xml_data)
end

#### 点のリストを構成
# ラベル => [x,y,z]
def get_pts(xml_data)
  res = {}
  REXML::XPath.each(xml_data, "geogebra/construction/element") {|elt|
    case elt.attribute('type').to_s
    when 'point'
      lbl = elt.attribute('label').to_s
      coord = elt.get_elements('coords').first
      res[lbl] = [coord.attribute('x').to_s.to_f, coord.attribute('y').to_s.to_f, 0.0]
    when 'point3d'
      lbl = elt.attribute('label').to_s
      coord = elt.get_elements('coords').first
      res[lbl] = [coord.attribute('x').to_s.to_f,
                  coord.attribute('y').to_s.to_f,
                  coord.attribute('z').to_s.to_f]
    end
  }
  res
end

#### 依存関係順にオブジェクトを走査して、線分と面のリストを作る
# 線分のリスト (ラベル=>[点ラベル, 点ラベル])
# 面のリスト (ラベル=>[点ラベル, ...])
# 点ラベルは座標の直接記述も許す
# [objs, cmds] は get_ordered_objs の返り値で、配列とHash
def scan_objs(xml_data, objs, cmds)
  segs = {}
  polys ={}
  objs.each {|obj|
    next if ! cmds.has_key?(obj)
    cmd = cmds[obj]
    is = cmd.get_elements('input').first.attributes.map {|a, v| v } # input
    os = cmd.get_elements('output').first.attributes.map {|a, v| v } # output
    case cmd.attribute('name').to_s
    when 'Segment'
      segs[obj] = is
    when 'Polygon'
      if /^[0-9]$/ !~ is[2] then # 通常の多角形
        polys[obj] = is
      else # 正多角形 (inputのa2が頂点数になっている)
        n = is[2].to_i # 正n角形
        polys[obj] = [is[0], is[1], *os[n+1..-1]]
      end
    when 'Pyramid'
      if false then
        raise '押し出しは未対応'
      end
      n = is.size-1 # n角錐
      polys[os[1]] = is[0..n-1] # 底面
      (0..n-1).each {|i| polys[os[i+2]] = [is[i], is[(i+1)%(n)], is[n]] } # 側面
    when 'Prism'
      if is.size == 2 then
        raise '押し出しは未対応'
      end
      n = is.size-1 # n角柱
      pts0 = is[0..n-1] # 底面の頂点
      pts1 = [is[n], *os[1..n-1]] # 上面の頂点 (詳細はreadme.txt)
      polys[os[n]] = pts0 # 底面
      (0..n-1).each {|i| # 側面
        polys[os[n+i+1]] = [pts0[i], pts0[(i+1)%n], pts1[(i+1)%n], pts1[i]] }
      polys[os[2*n+1]] = pts1 # 上面
    when 'Tetrahedron'
      polys[os[2]] = is # 底面
      3.times {|i| polys[os[i+3]] = [is[i-1], is[i], os[1]] } # 側面
    when 'Cube'
      pts0 = [is[0], is[1], is[2], os[1]]
      pts1 = os[2..5]
      polys[os[6]] = pts0 # 底面
      polys[os[11]] = pts1 # 上面
      4.times {|i| 
        polys[os[i+7]] = [pts0[i-1], pts0[i], pts1[i], pts1[i-1]] } # 側面
    end
  }
  [segs, polys]
end

#### main
# xml_str = read_ggb('/Users/wachiakihito/Downloads/seg.ggb')
# xml_data = parse_xml(xml_str)

# camera = get_camera(xml_data)
# view = get_view_size(xml_data)
# #p get_visibility(xml_data)

# obj_cmd = get_ordered_objs(xml_data)
# pts = get_pts(xml_data)
# segs, polys = scan_objs(xml_data, *obj_cmd)

# puts <<EOS % (camera + [view, pts, segs, polys])
# xZero, yZero, zZero = %s
# scale = %s
# xAngle, zAngle = %s
# w, h, len = %s
# pts = %s
# segs = %s
# polys = %s
# EOS
