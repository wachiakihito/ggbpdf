// -*- coding: utf-8; mode: javascript; mode: outline-minor; js-indent-level: 2 -*-
// Copyright (c) 2023 akihito wachi
// Released under the MIT license
// https://opensource.org/licenses/mit-license.php

// 3dのgeogberaのggbファイルを読み、必要な情報を構築する。

class GGBParser {
  // 子要素の属性取得
  static getAttr(elt, path, attr) {
    return elt.querySelector(path).getAttribute(attr);
  }

  // 子要素の数値属性取得
  static getAttrN(elt, path, attr) {
    return Number(elt.querySelector(path).getAttribute(attr));
  }

  //// 生成関数
  // 生成すると、自動的にメンバ変数に解析結果が設定される
  constructor(xml_str) {
    this.xml_str = xml_str; // 生成時に与えられたggbのxml文字列
    // 以下はパーズして得られる情報を格納するインスタンス変数
    this.xml = null; // パーズされたxmlデータ
    this.pts = {}; // {点のラベル=>3d座標}
    this.elts = {}; // element要素 + 頂点情報。 {ラベル=>情報の連想配列}
    this.cmds = []; // command要素 (不要?)。 [ラベル=>情報の連想配列] (これは配列)
    this.camera = {}; // 視点位置等。 {ラベル=>情報の連想配列}
    if (xml_str != null) {
      this.parse_xml(xml_str); // 何と何を作成する。
    }
  }

  //// ggbのxmlを読んで各種データ構造を構築
  parse_xml(str) {
    // xml読み込み
    var parser = new DOMParser();
    this.xml = parser.parseFromString(str, "application/xml");
    // カメラ情報 (this.camera)
    this.parse_xml_camera();
    // element要素 (this.elts)、点の座標データ構築 (this.pts)
    this.parse_xml_element_pt();
    // command要素 (this.cmds)
    this.parse_xml_command();
    // command要素を読み、オブジェクトの頂点座標、点の面所属を求める
    this.parse_cmd();
  }

  //// カメラの情報取得
  // this.camera に保管される情報のキー:
  //   xZero, yZero, zZero, scale, xAngle, zAngle,
  //   height, width,
  //   xAxisLen, scrnx, eyex
  parse_xml_camera() {
    var elt = this.xml.querySelector('geogebra euclidianView3D coordSystem');
    ['xZero', 'yZero', 'zZero', 'scale', 'xAngle', 'zAngle'].forEach ((s) =>
      { this.camera[s] = Number(elt.getAttribute(s)); }
    );
    // ウィンドウサイズ
    elt = this.xml.querySelector('geogebra euclidianView size');
    this.camera.height = elt.getAttribute('height');
    elt = this.xml.getElementById(512);
    this.camera.width = elt.getAttribute('size');
    // スクリーン位置、視点位置
    // スクリーンの位置は、x軸の最大値をtとすると、初期原点から手前3tの所にありそう。
    // 視点は初期原点から15tの所にありそう。
    this.camera.xAxisLen = this.camera.width * 0.35 / this.camera.scale;
    this.camera.scrnx = this.camera.xAxisLen * 3;
    this.camera.eyex = this.camera.xAxisLen * 15;
  }

  //// element要素 (this.elts)
  parse_xml_element_pt() {
    var elts = this.xml.querySelectorAll('geogebra construction element');
    elts.forEach ((elt) => {
      let lbl = elt.getAttribute('label');
      let res = {};
      // 表示・非表示、ラベルの表示・非表示
      res.type = elt.getAttribute('type');
      res.showobj = (GGBParser.getAttr(elt, 'show', 'object') == 'true');
      res.showlbl = (GGBParser.getAttr(elt, 'show', 'label') == 'true');
      //
      switch (res.type) {
      case 'point': // 点の座標、ラベルオフセット、this.ptsも
      case 'point3d':
        res.kind = 'Point'; // command要素がないのでここで設定
	// 座標
        if (res.type == 'point') {
          res.coords = [ GGBParser.getAttrN(elt, 'coords', 'x'),
                         GGBParser.getAttrN(elt, 'coords', 'y'),
                         0];
        } else {
          res.coords = [ GGBParser.getAttrN(elt, 'coords', 'x'),
                         GGBParser.getAttrN(elt, 'coords', 'y'),
                         GGBParser.getAttrN(elt, 'coords', 'z') ];
        }
	// this.pts
        this.pts[lbl] = res.coords;
	// ラベルオフセット
        let eltofst = elt.querySelector('labelOffset');
        let uv = [0, 0];
        if (eltofst) {
            uv = [Number(eltofst.getAttribute('x')),
                  Number(eltofst.getAttribute('y'))];
        }
        res.labelOffset = uv;
	// ラベルの表示
	let lblmode = GGBParser.getAttrN(elt, 'labelMode', 'val');
	let lbltxt = lbl;
	if (lblmode == 3 || lblmode == 9) {
	  lbltxt = GGBParser.getAttr(elt, 'caption', 'val');
	}
	res.labelText = lbltxt;
        break;
      case 'segment': // 線分の太さ、スタイル
      case 'segment3d':
        res.thickness = GGBParser.getAttrN(elt, 'lineStyle', 'thickness');
        res.lineType = GGBParser.getAttrN(elt, 'lineStyle', 'type');
        break;
      }
      this.elts[lbl] = res;
    });
  }

  //// command要素 (this.cmds)
  parse_xml_command() {
    var elts = this.xml.querySelectorAll('geogebra construction command');
    elts.forEach ((elt) => {
      let name = elt.getAttribute('name');
      let is = [];
      for (let attr of elt.querySelector('input').attributes) {
        is.push(attr.value)
      };
      let os = [];
      for (let attr of elt.querySelector('output').attributes) {
        os.push(attr.value);
      };
      this.cmds.push([name, is, os]);
    });
  }

  //// this.cmdsを読み、オブジェクトの頂点座標、点の面所属を求め this.eltsに設定
  // this.cmds = [[コマンド名, 入力, 出力]]
  parse_cmd() {
    this.cmds.forEach (([name, is, os]) => {
      switch (name) {
      case 'Point': // 点
        break;
      case 'Segment': // 線分
        this.store_seg(os[0], is);
        break;
      case 'Polygon': // 多角形
        if (/^[0-9]+$/.test(is[2])) {
          this.parse_cmd_regular_polygon(is, os);
        } else {
          this.parse_cmd_polygon(is, os);
        }
        break;
      case 'Pyramid': // 角錐
        if (/^[-.0-9]+$/.test(is[1])) {
          this.parse_cmd_pyramid_push(is, os);
        } else {
          this.parse_cmd_pyramid(is, os);
        }
        break;
      case 'Prism': // 角柱
        if (/^[-.0-9]+$/.test(is[1])) {
          this.parse_cmd_prism_push(is, os);
        } else {
          this.parse_cmd_prism(is, os);
        }
        break;
      case 'Tetrahedron':  // 正四面体
        this.parse_cmd_tetra(is, os);
        break;
      case 'Cube': // 立方体
        this.parse_cmd_cube(is, os);
        break;
      case 'Mirror': // 点に関する鏡映
        this.parse_cmd_mirror(is, os);
        break;
      };
    })
  }

  //// 多角形
  parse_cmd_polygon(is, os) {
    this.store_polygon(os[0], is); // 多角形
    this.store_segs(os.slice(1), is); // 辺
  }

  //// 正多角形
  // is は [最初の2頂点、n、含まれる平面]
  // os は [多角形, 辺たち(*), 残りの頂点(*)]
  // (*)の順序は、最初の2頂点から順に巡る順序
  parse_cmd_regular_polygon(is, os) {
    var n = parseInt(is[2]);
    var pts = [is[0], is[1], ...os.slice(n+1)];
    var segs = os.slice(1, n+1);
    this.store_polygon(os[0], pts); // 多角形
    this.store_segs(segs, pts); // 辺
  }

  //// 角錐
  // is は頂点たちで、最後が錐の頂点
  // os は [角錐, 底面, 側面たち(*), 底面の辺たち(*), 側面の辺たち(*)]
  // (*)の順序はisでの底面の頂点の順序と同じ
  parse_cmd_pyramid(is, os) {
    var n = is.length-1; // n角錐
    // 角錐
    this.store_pyramid(os[0], is);
    // 底面
    this.store_polygon(os[1], is.slice(0,-1));
    // 側面
    for (let i = 0; i < n; i++){
      let j = (i+1) % n;
      this.store_polygon(os[2+i], [is[i], is[j], is[n]]);
    }
    // 底面の辺
    this.store_segs(os.slice(n+2, n*2+2), is.slice(0,-1));
    // 側面の辺
    for (let i = 0; i < n; i++){
      this.store_seg(os[n*2+2+i], [is[i], is[n]]);
    }
  }

  //// 角錐 (押し出し)
  // is は [底面, 高さ]
  // os は [角錐, 錐の頂点, 側面たち(*), 側面の辺たち(*)]
  // (*)の順序はisでの底面の頂点の順序と同じ
  parse_cmd_pyramid_push(is, os) {
    var base = this.elts[is[0]].pts;
    var n = base.length; // n角錐
    // 角錐
    this.store_pyramid(os[0], [...base, os[1]]);
    // 側面
    for (let i = 0; i < n; i++){
      let j = (i+1) % n;
      this.store_polygon(os[2+i], [base[i], base[j], os[1]]);
    }
    // 側面の辺
    for (let i = 0; i < n; i++){
      this.store_seg(os[n+2+i], [base[i], os[1]]);
    }
  }

  //// 角柱
  // is は頂点たちで、最後以外が底面、最後が、is[0]の真上の頂点
  // os は [角柱, 上面の残りの頂点たち(*), 底面, 側面たち(*), 上面,
  //        底面の辺たち(*), 側面の辺たち(*), 上面の辺たち(*)]
  // (*)の順序はisでの底面の頂点の順序と同じ
  parse_cmd_prism(is, os) {
    var n = is.length-1; // n角柱
    // 角柱
    var pts1 = is.slice(0,-1);
    var pts2 = [is[n], ...os.slice(1, n)];
    this.store_prism(os[0], pts1, pts2);
    // 底面
    this.store_polygon(os[n], pts1);
    // 側面
    for (let i = 0; i < n; i++) {
      let j = (i+1) % n;
      this.store_polygon(os[n+1+i], [pts1[i], pts1[j], pts2[j], pts2[i]]);
    }
    // 上面
    this.store_polygon(os[n*2+1], pts2);
    // 底面の辺
    this.store_segs(os.slice(n*2+2, n*3+2), pts1);
    // 側面の辺
    for (let i = 0; i < n; i++) {
      this.store_seg(os[n*3+2+i], [pts1[i], pts2[i]]);
    }
    // 上面の辺
    this.store_segs(os.slice(n*4+2), pts2);
  }

  //// 角柱 (押し出し)
  // is は [底面, 高さ]
  // os は [角錐, 上面の頂点たち(*), 側面たち(*), 上面(*), 側面の辺たち(*), 上面の辺たち(*)]
  // (*)の順序はisでの底面の頂点の順序と同じ
  parse_cmd_prism_push(is, os) {
    var base = this.elts[is[0]].pts;
    var n = base.length; // n角柱
    var roof = os.slice(1, n+1);
    // 角柱
    this.store_prism(os[0], base, roof);
    // 側面
    for (let i = 0; i < n; i++) {
      let j = (i+1) % n;
      this.store_polygon(os[n+1+i], [base[i], base[j], roof[j], roof[i]]);
    }
    // 上面
    this.store_polygon(os[n*2+1], roof);
    // 側面の辺
    for (let i = 0; i < n; i++) {
      this.store_seg(os[n*2+2+i], [base[i], roof[i]]);
    }
    // 上面の辺
    this.store_segs(os.slice(n*3+2), roof);
  }

  //// 正四面体
  // is は底面の頂点たち
  // os は [正四面体, 錐の頂点, 底面, 側面たち(*1),
  //        底面の辺たち(*1), 側面の辺たち(*2)]
  // (*1) は、is[2], is[0], is[1] の順序
  // (*2) は、is[0], is[2], is[1] の順序
  // 側面の頂点の順序が大事なので、 parse_cmd_pyramid に帰着できない
  parse_cmd_tetra(is, os) {
    // 正四面体
    this.store_pyramid(os[0], [...is, os[1]]);
    // 底面
    this.store_polygon(os[2], [is[2], is[0], is[1]]);
    // 側面
    this.store_polygon(os[3], [os[1], is[0], is[2]]);
    this.store_polygon(os[4], [is[1], is[0], os[1]]);
    this.store_polygon(os[5], [is[2], is[1], os[1]]);
    // 底面の辺
    this.store_segs([os[6], os[7], os[8]], [is[2], is[0], is[1]]);
    // 側面の辺
    for (let i = 0; i < 3; i++) {
      this.store_seg(os[9+i], [os[1], is[[0,2,1][i]]]);
    }
  }

  //// 立方体
  // is は底面の3頂点
  // os は [立方体, 底面の残りの頂点, 上面の頂点(*1), 底面, 側面たち(*2), 上面,
  // 12-    底面の辺たち(*2),
  // 16-      側面の辺i0, 側面の辺o1, 上面の辺o1, 上面の辺i0,
  // 20-      側面の辺i1, 上面の辺i1, 側面の辺i2, 上面の辺i2
  // (*1) は、is[0], is[1], is[2], os[1] の順序
  // (*2) は、os[1], is[0], is[1], is[2] の順序
  // 側面と上面の辺は、(*1)の順序で考えたときのどの順番かをi0等で表したもの
  parse_cmd_cube(is, os) {
    // 立方体
    this.store_prism(os[0], [os[1], is[0], is[1], is[2]], os.slice(2,6));
    // 底面
    this.store_polygon(os[6], [os[1], is[0], is[1], is[2]]);
    // 側面
    this.store_polygon(os[7], [os[2], is[0], os[1], os[5]]);
    this.store_polygon(os[8], [is[1], is[0], os[2], os[3]]);
    this.store_polygon(os[9], [is[2], is[1], os[3], os[4]]);
    this.store_polygon(os[10], [os[1], is[2], os[4], os[5]]);
    // 上面
    this.store_polygon(os[11], [os[2], os[5], os[4], os[3]]);
    // 底面の辺
    this.store_segs(os.slice(12,16), [os[1] , is[0], is[1], is[2]]);
    // 側面の辺
    this.store_seg(os[16], [is[0], os[2]]);
    this.store_seg(os[17], [os[1], os[5]]);
    this.store_seg(os[20], [is[1], os[3]]);
    this.store_seg(os[22], [is[2], os[4]]);
    // 上面の辺
    this.store_segs([os[19], os[21], os[23], os[18]], os.slice(2,6));
 }

  //// 鏡映 (多角形のみ処理する)
  // isは [鏡映前図形, 点または直線または面]
  // osは [鏡映後図形]
  parse_cmd_mirror(is, os) {
    if (GGBPDF.ggb.elts[is[0]].kind != 'Polygon') { return }; // 多角形の鏡映以外は何もしない
    // 今のところ点に関する鏡映のみ対応
    if (is[1] in GGBPDF.ggb.elts) {
      this.parse_cmd_mirror_pt(is, os);
    }
  }

  //// 点に関する鏡映 (多角形のみ処理する。線分は処理なしでうまくいっている)
  // isは [多角形, 点]
  // osは [鏡映後図形]
  parse_cmd_mirror_pt(is, os) {
    var poly = GGBPDF.ggb.elts[is[0]].pts.map ((lbl) => GGBPDF.ggb.pts[lbl]);
    var pt = GGBPDF.ggb.elts[is[1]].coords;
    var pt2 = V.scl(2, pt);
    var poly_mirror = poly.map ((u) => {
      let [x,y,z] = V.sub(pt2, u);
      return `(${x},${y},${z})` });
    this.store_polygon(os[0], poly_mirror);
  }

  //// 線分をthis.eltsに登録
  store_seg(lbl, pts) {
    this.elts[lbl].kind = 'Segment';
    this.elts[lbl].pts = pts; // 両端の点
  }

  //// 複数の線分を一度にthis.eltsに登録
  // lblsよりptsが1つ多い想定だが、ptsが少なければ循環する
  store_segs(lbls, pts) {
    var n = pts.length;
    for (let i = 0; i < lbls.length; i++) {
      this.store_seg(lbls[i], [pts[i], pts[(i+1)%n]]);
    }
  }

  //// 多角形をthis.eltsに登録
  store_polygon(lbl, pts) {
    this.elts[lbl].kind = 'Polygon';
    this.elts[lbl].pts = pts;
  }

  //// 角錐をthis.eltsに登録
  // pts は最後が錐の頂点
  store_pyramid(lbl, pts) {
    this.elts[lbl].kind = 'Pyramid';
    this.elts[lbl].apex = pts[pts.length-1];
    this.elts[lbl].pts = pts.slice(0, -1);
  }

  //// 角柱をthis.eltsに登録
  store_prism(lbl, pts1, pts2) {
    this.elts[lbl].kind = 'Prism';
    this.elts[lbl].pts1 = pts1;
    this.elts[lbl].pts2 = pts2;
  }
} // end of class GGBParser
