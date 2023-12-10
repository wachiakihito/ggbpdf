// -*- coding: utf-8; mode: javascript; mode: outline-minor; js-indent-level: 2 -*-
// Copyright (c) 2023 akihito wachi
// Released under the MIT license
// https://opensource.org/licenses/mit-license.php

//// ggbのグローバルjavascriptに記述するもの
function ggbOnInit() {
  GGBPDF.setup();
}

//// ggbからsvgやpdfを生成
class GGBPDF {
  // svg領域とpdf領域のサイズ (とりあえず正方形)
  static SVGW = 360;
  static PDFW = 360;
  // 描画に関する設定
  static gap = 0.2;          // 線分の背後のギャップ
  static intw = 4;           // 面の交線の太さ
  static drawedges = true;   // 面の辺を描画するか
  static drawint = true;     // 面の交線を描画するか
  static hidden = true;      // 陰線を描画するか
  // 描画領域の要素
  static svgpane = null;     // table要素
  static svg = null;         // svg要素
  static pdf = null;         // pdfのiframe要素
  // ネットワーク接続あるか。htmlでないときもfalseになる
  static online = false;
  // xmlを解釈したデータ
  static ggb = null;
  // 面と線分
  static polys3d = [];   // 多角形は点の配列。座標に展開されている
  static segs3d = [];    // 線分は点の配列。座標に展開されている
  static segstyles = []; // segs3dと同じ長さ。要素は連想配列
  static s_on_p = [];    // segs3dと同じ長さ。要素はその線分を含む面番号
  // レンダリング状態
  static updating = false; // 図形の更新中か
  static update_pending = false; // 図形の更新の保留があるか
  // レンダリング結果
  static hlr = null;

  //// 線分が、segs3dに属する線分と大体同じか判定
  // 同じ線分があれば線分番号を返し、ないならnullを返す。
  static sameSeg(seg, segs3d) {
    for (let i = 0; i < segs3d.length; i++) {
      let si=segs3d[i];
      let d0 = V.sub(seg[0], segs3d[i][0]);
      let d1 = V.sub(seg[1], segs3d[i][1]);
      if (V.inn(d0, d0) < EPS*10 && V.inn(d1, d1) < EPS*10) { return i; }
    }
    return null;
  }

  //// 点のラベルを座標にして返す
  // 座標の直接入力だった場合は、それを解釈して返す
  static coord(lbl) {
    // ラベル
    if (lbl[0] != '(') {
      return GGBPDF.ggb.pts[lbl];
    }
    // 座標
    var str = lbl.slice(1,-1);
    return str.split(',').map ((x) => Number(x));
  }

  //// svg, pdf領域の作成
  static setup_floater() {
    // 前回のが残っていたら何もしない
    if (document.getElementById('svgpane')) { return; }
    // 陰線表示等のコントロール、svg領域、pdf領域のtable要素
    var html = `<table id="svgpane" style="position:absolute;left:0px;top:0px;z-index:180;background-color:#ffffff;opacity:0.9;border:1px solid"><tbody>
      <tr><td>
      <label><input type="checkbox" id="hidden-line" checked>hidden lines</label> /
      <label>int.<input type="number" id="intw" min="0" max="8" step="1" value="4"></label> /
      <label>gap<input type="number" id="gap" min="0" max="1" step="0.1" value="0.2"></label>
      <button id="download-svg">download</button>
      </td></tr>
      <tr><td>
      <svg id="mysvg" viewBox="0 0 ${GGBPDF.SVGW} ${GGBPDF.SVGW}" width="${GGBPDF.SVGW}" xmlns="http://www.w3.org/2000/svg"></svg>
      </td></tr>
      <tr><td>
      <button id="gen-pdf">generate pdf</button>
      </td></tr>
      <tr><td>
      <iframe id="pdf" style="width:${GGBPDF.PDFW+5}px; height:${GGBPDF.PDFW+5}px;"></iframe>
      </td></tr>
      </tbody></table>`;
    // コントロールや描画領域を追加
    document.body.insertAdjacentHTML('beforeend', html);
  }

  //// svg, pdf領域の移動を可能にする
  static setup_floater_movable() {
    GGBPDF.svgpane.style.left = (window.innerWidth - GGBPDF.svgpane.clientWidth) + "px";
    GGBPDF.svgpane.style.top = "0px";
    GGBPDF.svgpane.ondragstart = function() { return false };
    GGBPDF.svgpane.onmousedown = function(event) {
      // マウスポインタの初期位置の領域左上からのオフセット
      var ox = event.pageX - parseInt(GGBPDF.svgpane.style.left);
      var oy = event.pageY - parseInt(GGBPDF.svgpane.style.top);
      document.addEventListener('mousemove', onMouseMove);
      // マウスムーブ
      function onMouseMove(event) {
        var x = event.pageX;
        var y = event.pageY;
        // 幅はウィンドウに収める
        var left = x - ox;
        var right = left + GGBPDF.svgpane.clientWidth;
        if (right > window.innerWidth) {
          left -= right - window.innerWidth;
        } else if (left < 0) {
          left = 0;
        }
        // 高さは、上がはみ出さず、下は最低30px残るように
        var top = y - oy;
        var bottom = top + GGBPDF.svgpane.clientHeight;
        if (top > window.innerHeight - 30) {
          top = window.innerHeight - 30;
        } else if (top < 0) {
          top = 0;
        }
        // 移動
        GGBPDF.svgpane.style.left = left + 'px';
        GGBPDF.svgpane.style.top = top + 'px';
      }

      document.addEventListener('mousemove', onMouseMove);
      // マウスアップ
      document.onmouseup = function() {
        document.removeEventListener('mousemove', onMouseMove);
        document.onmouseup = null;
      };
    };
  }

  //// svg領域、イベントハンドラの初期化
  static async setup() {
    // svg, pdf領域の作成
    GGBPDF.setup_floater();
    GGBPDF.svgpane = document.getElementById('svgpane');
    GGBPDF.svg = document.getElementById('mysvg');
    GGBPDF.pdf = document.getElementById('pdf');
    GGBPDF.setup_floater_movable();
    // ggb操作のイベントを受信して図形を更新し描画するイベントリスナ (クラス関数はダメ?)
    if (typeof ggbApplet !== "undefined") {
      ggbApplet.registerAddListener("update_draw");
      ggbApplet.registerRemoveListener("update_draw");
      ggbApplet.registerUpdateListener("update_draw");
      ggbApplet.registerRenameListener("update_draw");
      ggbApplet.registerClearListener("update_draw");
      // ggb操作のイベントを受信して描画するイベントリスナ (クラス関数はダメ?)
      ggbApplet.registerClientListener("maybe_draw");
    }
    // チェックボックス等のクリックを受信して図形を更新し描画するイベントリスナ
    document.getElementById('hidden-line').addEventListener('click', GGBPDF.update_draw);
    document.getElementById('intw').addEventListener('click', GGBPDF.update_draw);
    document.getElementById('intw').addEventListener('keyup', GGBPDF.update_draw);
    document.getElementById('gap').addEventListener('click', GGBPDF.update_draw);
    document.getElementById('gap').addEventListener('keyup', GGBPDF.update_draw);
    // svgのダウンロードボタンと、pdfの描画ボタンのイベントリスナ
    document.getElementById('gen-pdf').addEventListener('click', PDF.render);
    document.getElementById('download-svg').addEventListener('click', SVG.downloadSVG);
    // オンラインならpdf-libを同期でインポート
    // htmlにエクスポートされているのでなければネットワーク接続はない
    GGBPDF.online = (navigator.onLine && (window.location.href.slice(0,3) != 'app'));
    if (GGBPDF.online) {
      await import("https://unpkg.com/pdf-lib"); // pdf-lib
      await import("https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"); // katex
      document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" integrity="sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV" crossorigin="anonymous">');
    } else {
      let btn = document.getElementById('gen-pdf');
      btn.setAttribute('disabled', true);
      btn.parentElement.parentElement.style.display = 'none';
      GGBPDF.pdf.setAttribute('disabled', true);
      GGBPDF.pdf.parentElement.parentElement.style.display = 'none';
    }
    // ggbが動いていたら最初の1回分の描画
    if (typeof ggbApplet !== "undefined") {
      GGBPDF.update_draw();
    } else { // ggbが動いていない時用に、ボタンid=xml2svgにイベントハンドラを設定
    document.getElementById('xml2svg').addEventListener('click', GGBPDF.update_draw);
    }
  }

  //// xml文字列の取得。
  // ggbが動いていればggbから取得
  // ggbが動いていなければ、テキストエリア#xmlから取得
  static getXML() {
    if (typeof ggbApplet !== "undefined") {
      return ggbApplet.getXML();
    } else {
      return document.getElementById('xml').value;
    }
  }

  //// 図形オブジェクトの更新
  // xmlは、ggbApplet.getXML()の結果の文字列
  static updateObject(xml) {
    // xml解釈
    GGBPDF.ggb = new GGBParser(xml);
    // 面と線分を収集 (座標に展開)
    GGBPDF.polys3d = [];
    GGBPDF.segs3d = [];
    GGBPDF.segstyles = [];
    for (let lbl of Object.keys(GGBPDF.ggb.elts)) {
      if (! GGBPDF.ggb.elts[lbl].showobj) { continue; }
      switch (GGBPDF.ggb.elts[lbl].kind) {
      case 'Polygon':
        GGBPDF.polys3d.push(GGBPDF.ggb.elts[lbl].pts.map ((x) => GGBPDF.coord(x)));
        break;
      case 'Segment':
        GGBPDF.segs3d.push(GGBPDF.ggb.elts[lbl].pts.map ((x) => GGBPDF.coord(x)).sort(CMPA));
        GGBPDF.segstyles.push({thickness:GGBPDF.ggb.elts[lbl].thickness,
                               lineType:GGBPDF.ggb.elts[lbl].lineType});
        break;
      }
    }
    // 面の辺について、線分を含む面を収集。配列の第i要素は、その番号の線分を含む面番号の配列
    GGBPDF.s_on_p = [];
    for (let i = 0; i < GGBPDF.segs3d.length; i++) {
      let [u, v] = GGBPDF.segs3d[i];
      GGBPDF.s_on_p.push([]);
      for (let j = 0; j < GGBPDF.polys3d.length; j++) {
        if (GGBPDF.polys3d[j].includes(u) && GGBPDF.polys3d[j].includes(v)) {
          GGBPDF.s_on_p[i].push(j);
        }
      }
    }
    // 面の交線を収集
    GGBPDF.intw = Number(document.getElementById('intw').value); // 面の交線の太さ
    if (GGBPDF.intw <= 0) { GGBPDF.intw = null };
    if (GGBPDF.intw != null) {
      GGBPDF.gen_intersection();
    }
    // 改めて線分を含む面を収集 (辺とか交線でないものの調査はこの位置が多分一番軽い)
    for (let j = 0; j < GGBPDF.polys3d.length; j++) {
      let plane = V.plane_eq(...GGBPDF.polys3d[j].slice(0,3)); // 高速化のためplane_eq2はやめる
      for (let i = 0; i < GGBPDF.segs3d.length; i++) {
        if (GGBPDF.s_on_p[i].includes(j)) { continue };
        let [u, v] = GGBPDF.segs3d[i];
        if (Math.abs(V.plane_pt(plane, u)) < EPS && Math.abs(V.plane_pt(plane, v)) < EPS) {
          GGBPDF.s_on_p[i].push(j);
        }
      }
    }
  }

  //// 面の交線を収集
  // polys3d を元に交線を追加する
  static gen_intersection() {
    for (let i = 0; i < GGBPDF.polys3d.length; i++) {
      for (let j = i+1; j < GGBPDF.polys3d.length; j++) {
        let segs = V.int_poly_poly(GGBPDF.polys3d[i], GGBPDF.polys3d[j]);
        segs.forEach ((seg) => {
          seg = seg.sort(CMPA);
          let k = GGBPDF.sameSeg(seg, GGBPDF.segs3d);
          if (k === null) {
            GGBPDF.segs3d.push(seg);
            GGBPDF.segstyles.push({thickness:(GGBPDF.intw), lineType:0}); // 交線スタイル
            GGBPDF.s_on_p[GGBPDF.segs3d.length-1] = [i,j];
          } else {
            GGBPDF.s_on_p[k].push(i, j);
          }
        });
      }
    }
  }

  //// 描画
  // オブジェクトの更新はせず、視点の変更だけ再計算
  static draw() {
    GGBPDF.hidden = document.getElementById('hidden-line').checked; // 陰線表示
    GGBPDF.gap = Number(document.getElementById('gap').value); // 切り欠き
    if (GGBPDF.gap <= 0) { GGBPDF.gap = null };
    // 陰線処理
    GGBPDF.hlr = new HLR(GGBPDF.ggb.camera,
                         GGBPDF.gap, GGBPDF.polys3d, GGBPDF.segs3d, GGBPDF.segstyles,
                         GGBPDF.s_on_p);
    // svg描画
    SVG.render(GGBPDF.svg, GGBPDF.ggb, GGBPDF.hlr, GGBPDF.hidden);
  }

  //// 図形の更新をイベントを調整して行う
  // GGBPDF.updating = 図形の更新中か
  // GGBPDF.update_pending = 図形の更新の保留があるか
  // 返り値は、true/false = 更新した/しない
  static smart_update()  {
    // 既に保留にされた更新があるなら、新規の更新はなくてよい
    if (GGBPDF.update_pending) {
      return false;
    } else if (GGBPDF.updating) { // 更新中なら保留を発生
      GGBPDF.update_pending = true;
      return false;
    }
    // 保留がなくなるまで更新
    while (true) {
      // 更新する
      GGBPDF.updating = true;
      try {
	let xml = GGBPDF.getXML();
        GGBPDF.updateObject(xml);
        } catch (ex) {
          GGBPDF.pending = true;
      } finally {
        GGBPDF.updating = false;
      }
      // たまっている更新がなければ終了
      if (! GGBPDF.update_pending) {
        return true;
      }
      // 再更新
      GGBPDF.update_pending = false;
    }
  }

  //// 図形が更新されたときのイベントリスナ
  static update_draw(...args) {
    var res = GGBPDF.smart_update();
    if (res) { GGBPDF.draw(); }
  }

  //// その他のベントリスナ
  static maybe_draw(ev) {
    switch (ev.type) {
    case 'viewChanged3D':
      var xml = GGBPDF.getXML();
      GGBPDF.ggb = new GGBParser(xml);
      GGBPDF.draw();
      break;
    case 'updateStyle':
    case 'undo':
    case 'redo':
      var res = GGBPDF.smart_update();
      if (res) { GGBPDF.draw(); }
      break;
    }
  }
} // end of class GGBPDF

//// ggbApplet.registerAddListener 等がクラス関数を受け付けないのでグローバルなハンドラ
var maybe_draw = GGBPDF.maybe_draw;
var update_draw = GGBPDF.update_draw;
