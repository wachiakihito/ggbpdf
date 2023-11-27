// -*- coding: utf-8; mode: javascript; mode: outline-minor; js-indent-level: 2 -*-
// Copyright (c) 2023 akihito wachi
// Released under the MIT license
// https://opensource.org/licenses/mit-license.php

// 3dのgeogberaのggbファイルを読み、必要な情報を構築する。

class ParseGGB {
  // トポロジカルソート
  // 入力 es = {x=>[xより小さい要素]}
  //      es のキーがすべての要素でなくてはならない
  //      es は破壊される
  // 出力 要素を tsortした配列
  static tsort(es) {
    let ans = [];
    while (Object.keys(es).length > 0) {
      ParseGGB.tsort_(Object.keys(es)[0], es, ans);
    }
    return ans;
  }

  // tsortの下請け
  static tsort_(x, es, ans) {
    if (! (x in es)) { return };
    es[x].forEach ((y) => { ParseGGB.tsort_(y, es, ans) });
    ans.push(x);
    delete es[x];
  }

  // xmlデータを与えると、依存関係順に全オブジェクトを並べた配列を返す
  // 後の図形が先の図形に依存しているようなラベルの配列と、
  // command要素を持つラベル=>command要素 のHashを返す。
  static get_ordered_objs(xml_data) {
    // 全ラベル収集
    var h = {};
    var res = {};
    var elts = xml_data.querySelectorAll('geogebra construction element');
    elts.forEach ((elt) => {
      h[elt.getAttribute('label')] = []
    });
    var lbls = Object.keys(h);
    // 依存関係収集
    elts = xml_data.querySelectorAll('geogebra construction command');
    elts.forEach ((elt) => {
      let input = [];
      for (let attr of elt.querySelector('input').attributes) { 
	if (attr.value in lbls) { input.push(attr.value) };
      };
      let output = [];
      for (let attr of elt.querySelector('output').attributes) { 
	output.push(attr.value); 
      };
      output.forEach ((o) => {
	h[o] = [...new Set(...h[o], ...input)]
      });
      res[output[0]] = elt; // command要素を持つラベル=>cammand要素
    });
    return [ParseGGB.tsort(h), res];
  }

  // xmlデータを与えると、表示・非表示のHashを返す
  // ラベル => true/false
  // /geogebra/construction/element/show 要素の object属性にtrue/false
  static get_visibility(xml_data) {
    var res = {};
    var elts = xml_data.querySelectorAll('geogebra construction element');
    elts.forEach ((elt) => {
      let lbl = elt.getAttribute('label');
      let attr = elt.querySelector('show').getAttribute('object');
      res[lbl] = (attr == 'true');
    });
    return res;
  }

  // 点の座標とラベルオフセットのリストを構成
  // ラベル => [x,y,z]
  // ラベル=>ラベルオフセット [u,v] (vは下向きが正、表示するもののみ)
  static get_pts(xml_data) {
    var xyzs = {};
    var lofst = {};
    var elts = xml_data.querySelectorAll('geogebra construction element');
    elts.forEach ((elt) => {
      let lbl = elt.getAttribute('label');
      let attr = elt.getAttribute('type');
      // 座標
      if (attr == 'point') {
	let coord = elt.querySelector('coords');
	xyzs[lbl] = [Number(coord.getAttribute('x')),
		     Number(coord.getAttribute('y')),
		     0];
      } else if (attr == 'point3d') {
	let coord = elt.querySelector('coords');
	xyzs[lbl] = [Number(coord.getAttribute('x')),
		     Number(coord.getAttribute('y')),
		     Number(coord.getAttribute('z'))];
      }
      // ラベル表示・非表示、位置
      if (attr == 'point' || attr == 'point3d') {
	let showobj = elt.querySelector('show').getAttribute('object');
	let showlabel = elt.querySelector('show').getAttribute('label');
	if (showobj == "true" && showlabel == "true") {
	  let eltofst = elt.querySelector('labelOffset');
	  let [u, v] = [0, -0];
	  if (eltofst) {
	    u = Number(eltofst.getAttribute('x'));
	    v = Number(eltofst.getAttribute('y'));
	  }
	  lofst[lbl] = [u, v]
	}
      }
    });
    return [xyzs, lofst];
  }

  // 依存関係順にオブジェクトを走査して、線分と面のリストを作る
  // 線分のリスト (ラベル=>[点ラベル, 点ラベル])
  // 面のリスト (ラベル=>[点ラベル, ...])
  // 点ラベルは座標の直接記述も許す
  // [objs, cmds] は get_ordered_objs の返り値で、配列とHash
  static scan_objs(xml_data, objs, cmds) {
    var segs = {};
    var polys = {};
    for (let k = 0; k < objs.length; k++) {
      let obj = objs[k];
      let cmd = cmds[obj];
      if (! (obj in cmds)) { continue };
      cmd = cmds[obj];
      let is = [];
      for (let attr of cmd.querySelector('input').attributes) { 
	is.push(attr.value)
      };
      let os = [];
      for (let attr of cmd.querySelector('output').attributes) { 
	os.push(attr.value); 
      };
      let n;
      switch (cmd.getAttribute('name')) {
      case 'Segment':
	segs[obj] = is;
	break;
      case 'Polygon':
	if (! /^[0-9]*$/.test(is[2])) { // 通常の多角形
	  polys[obj] = is;
	} else { // 正多角形 (inputのa2が頂点数になっている)
	  n = parseInt(is[2]);
	  polys[obj] = [is[0], is[1], ...os.slice(n+1)];
	}
	break;
      case 'Pyramid':
	if (false) {
	  throw '押し出しは未対応'
	}
	n = is.length - 1; // n角錐
	polys[os[1]] = is.slice(0, n); // 底面
	for (let i = 0; i < n; i++) {
	  polys[os[i+2]] = [is[i], is[(i+1)%n], is[n]];  // 側面
	}
	break;
      case 'Prism':
	if (is.length == 2) {
	  break;
	  throw '押し出しは未対応';
	}
	n = is.length - 1 // n角柱
	var pts0 = is.slice(0, n) // 底面の頂点
	var pts1 = [is[n], ...os.slice(1, n)] // 上面の頂点 (詳細はreadme.txt)
	polys[os[n]] = pts0 // 底面
	for (let i = 0; i < n; i++) { // 側面
	  polys[os[n+i+1]] = [pts0[i], pts0[(i+1)%n], pts1[(i+1)%n], pts1[i]];
	}
	polys[os[2*n+1]] = pts1; // 上面
	break;
      case 'Tetrahedron':
	polys[os[2]] = is // 底面
	for (let i = 0; i < 3; i++) {
	  polys[os[i+3]] = [is[(i+2)%3], is[i], os[1]]; // 側面 (inputは底面の3頂点)
	}
	break;
      case 'Cube':
	var pts0 = [is[0], is[1], is[2], os[1]];
	var pts1 = os.slice(2, 6);
	polys[os[6]] = pts0 // 底面
	polys[os[11]] = pts1 // 上面
	for (let i = 0; i < 4; i++) {
	  polys[os[i+7]] = [pts0[(i+3)%4], pts0[i], pts1[i], pts1[(i+3)%4]]; // 側面
	}
	break;
      }
    }
    return  [segs, polys];
  }

  // geogebra.xmlを渡すと、情報の連想配列を返す。キーは、
  // xZero, yZero, zZero 	原点の平行移動量
  // scale			拡大率
  // xAngle, zAngle		回転量
  // height, width		GeoGebraの3Dビューの幅・高さ
  // eyex, scrnx		視点とスクリーン位置のx座標
  // pts			点の連想配列 (ラベル=>[座標])
  // lofst			点の表示ラベル位置 (ラベル=>false/[u,v])
  // segs, polys		線分、面の連想配列 (ラベル=>[点,..])
  // vis			表示・非表示の連想配列  (ラベル=>true/false)
  static parseGGB(xml) {
    // xml読み込み
    var parser = new DOMParser();
    var doc = parser.parseFromString(xml, "application/xml");
    // カメラの情報取得
    var elt = doc.querySelector('geogebra euclidianView3D coordSystem')
    var xZero = Number(elt.getAttribute('xZero'));
    var yZero = Number(elt.getAttribute('yZero'));
    var zZero = Number(elt.getAttribute('zZero'));
    var scale = Number(elt.getAttribute('scale'));
    var xAngle = Number(elt.getAttribute('xAngle'));
    var zAngle = Number(elt.getAttribute('zAngle'));
    // ウィンドウサイズ
    elt = doc.querySelector('geogebra euclidianView size');
    var height = elt.getAttribute('height');
    elt = doc.getElementById(512);
    var width = elt.getAttribute('size')
    // スクリーン位置、視点位置
    // スクリーンの位置は、x軸の最大値をtとすると、初期原点から手前3tの所にありそう。
    // 視点は初期原点から15tの所にありそう。
    var xAxisLen = width * 0.35 / scale;
    var scrnx = xAxisLen * 3;
    var eyex = xAxisLen * 15;
    // 依存関係順のオブジェクトの配列と、command要素の連想配列
    var [objs, cmds] = ParseGGB.get_ordered_objs(doc);
    // 表示・非表示のリスト
    var vis = ParseGGB.get_visibility(doc);
    // 点のリスト {ラベル=>[x,y,z]}、表示ラベルのオフセット (ラベル=>false/[u,v])
    var [pts, lofst] = ParseGGB.get_pts(doc);
    // 線分と面のリスト
    var [segs, polys] = ParseGGB.scan_objs(doc, objs, cmds, vis);
    //
    return {
      xZero:xZero, yZero:yZero, zZero:zZero,
      scale:scale,
      xAngle:xAngle, zAngle:zAngle,
      height:height, width:width,
      eyex:eyex, scrnx:scrnx,
      pts:pts, lofst,lofst, 
      segs:segs, polys:polys,
      vis:vis
    }
  }
}; // end of class ParseGGB
