// -*- coding: utf-8; mode: javascript; mode: outline-minor; js-indent-level: 2 -*-
// Copyright (c) 2023 akihito wachi
// Released under the MIT license
// https://opensource.org/licenses/mit-license.php

// ggbのグローバルjavascriptに記述するもの
async function ggbOnInit() {
  // 各種コントロールの初期化
  if (GGBPDF.TWOWINDOW) { // svg, pdfを別ウィンドウで開く場合、ウィンドウにコントロールを作成
    GGBPDF.setup_control_2win();
  } else {  // svg, pdf をggbと同じウィンドウで開く場合、コントロールと描画領域を作成
    GGBPDF.setup_svg_pdf_1win();
  }
  // ggb操作のイベントを受信して図形を更新し描画するイベントリスナ (クラス関数はダメ?)
  ggbApplet.registerAddListener("update_draw");
  ggbApplet.registerRemoveListener("update_draw");
  ggbApplet.registerUpdateListener("update_draw");
  ggbApplet.registerRenameListener("update_draw");
  ggbApplet.registerClearListener("update_draw");
  // ggb操作のイベントを受信して描画するイベントリスナ (クラス関数はダメ?)
  ggbApplet.registerClientListener("maybe_draw");
  // チェックボックス等のクリックを受信して図形を更新し描画するイベントリスナ
  document.getElementById('hidden-line').addEventListener('click', GGBPDF.update_draw);
  document.getElementById('int-p-p').addEventListener('click', GGBPDF.update_draw);
  document.getElementById('gap').addEventListener('click', GGBPDF.update_draw);
  document.getElementById('gap').addEventListener('keyup', GGBPDF.update_draw);
  document.getElementById('gen-pdf').addEventListener('click', renderPDF);
  // 同期でライブラリを読むので、オフラインだとハングする
  await import("https://unpkg.com/pdf-lib");
}

// ggbのhtmlエクスポートを修正してpdfを出力できるようにするクラス
class GGBPDF {
  // svg, pdf領域のあるウィンドウ (windowに等しい場合と、別ウィンドウの場合あり)
  static TWOWINDOW = false; // 別ウィンドウを開くか
  static win = null;
  static SVGW = 400;        // svg領域のサイズ (とりあえず正方形)
  static PDFW = 400;        // pdf領域のサイズ (とりあえず正方形)
  // 描画に関する設定
  static drawedges = true; // 多面体の辺を描画するか
  static gap = 0.2;          // 線分の背後のギャップ
  static drawint = true;     // 面の交線を描画するか
  static hidden = true;      // 陰線を描画するか

  // ggbと同一ウィンドウにsvgとpdfの領域を確保する
  static setup_svg_pdf_1win() {
    // 陰線表示等のコントロール、svg領域、pdf領域のtable要素
    var html = `<table style="position:absolute;right:0px;top:0px;border:1px solid"><tbody>
      <tr><td>
      <label><input type="checkbox" id="hidden-line" checked>hidden lines</label>
      <label><input type="checkbox" id="int-p-p" checked>intersection of polygons</label> / 
      <label>gap width<input type="number" id="gap" min="0" max="1" step="0.1" value="0.2"></label>
      </td></tr>
      <tr><td>
      <svg id="mysvg" viewBox="0 0 ${GGBPDF.SVGW} ${GGBPDF.SVGW}" onclick="GGBPDF.downloadSVG()" width="${GGBPDF.SVGW}" xmlns="http://www.w3.org/2000/svg"></svg>
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
    // svg, pdf領域の初期化
    GGBPDF.win = window;
    OutputSVG.initialize(window);
    GGBPDF.update_draw();
  }

  // ggbと別ウィンドウにsvgとpdfの領域を確保する場合用に、
  // ggbと同じウィンドウにコントロールを準備する。
  static setup_control_2win() {
    // svgウィンドウを開くリンクと初期化するリンク
    var html = `<a href="about:blank" target="svg_window">open window</a>
      <a href="javascript:GGBPDF.setupsvgwindow();">init window</a>
      <label><input type="checkbox" id="hidden-line" checked>hidden lines</label>
      <label><input type="checkbox" id="int-p-p" checked>intersection of polygons</label> / 
      <label>gap width<input type="number" id="gap" min="0" max="1" step="0.1" value="0.2"></label>
      <button id="gen-pdf">generate pdf</button>`
    window.document.body.insertAdjacentHTML('beforeend', html);
  }

  // 別ウィンドウの初期化のイベントハンドラ (別ウィンドウを開く版)
  static setupsvgwindow() {
    if (! GGBPDF.TWOWINDOW) { return }; // 別ウィンドウを開かない版 (来ないはず)
    // 別ウィンドウ取得 (ボタンクリックで開いたウィンドウのオブジェクトを取得)
    GGBPDF.win = window.open('', 'svg_window');
    if (! GGBPDF.win) { return };
    // 既にあるなら何もしない
    if (GGBPDF.win.document.getElementById('mysvg')) { return };
    // svg, pdf 領域作成
    var html = `<svg id="mysvg" viewBox="0 0 ${GGBPDF.SVGW} ${GGBPDF.SVGW}" onclick="GGBPDF.downloadSVG()" width="${GGBPDF.SVGW}" xmlns="http://www.w3.org/2000/svg"></svg>
<iframe id="pdf" style="width:${GGBPDF.PDFW+5}px; height:${GGBPDF.PDFW+5}px;"></iframe>`;
    GGBPDF.win.document.body.insertAdjacentHTML('beforeend', html);
    // svgウィンドウの情報を初期化
    OutputSVG.initialize(GGBPDF.win);
    GGBPDF.update_draw();
  }

  // SVGのダウンロード
  static downloadSVG() {
    // svgのテキスト作成
    var td = OutputSVG.svg.parentElement;
    var svgtext = td.innerHTML;
    // blob作成
    const filename = 'ggbsvg.svg';
    const blob = new Blob([svgtext], { type: 'image/svg+xml' });
    // A要素で無理矢理ダウンロード
    const elt = document.createElement('a');
    elt.href = URL.createObjectURL(blob);
    elt.target = '_blank';
    elt.download = filename;
    elt.click();
    URL.revokeObjectURL(elt.href);
  }

  // 図形オブジェクトの更新
  // 視点の情報を再利用するため、ParseGGB.parseGGBの返り値を、返り値として返す。
  static updateObject() {
    // xml取得と解釈
    var xml = ggbApplet.getXML();
    var ggb = ParseGGB.parseGGB(xml);
    // 面を取得し登録
    var polys3d = [];
    Object.keys(ggb.polys).forEach ((lbl) => {
      if (ggb.vis[lbl]) { // 表示されているときのみ登録
	polys3d.push(ggb.polys[lbl].map ((pt) => ggb.pts[pt] ));
      }
    });
    // 線分を取得し登録
    var segs3d = [];
    for (let lbl of Object.keys(ggb.segs)) {
      if (! ggb.vis[lbl]) continue; // 表示されているときのみ登録
      segs3d.push(ggb.segs[lbl].map ((pt) => ggb.pts[pt] ));
    }
    // 図形オブジェクトを登録
    GGBPDF.drawint = document.getElementById('int-p-p').checked; // 面の交線表示チェックボックス
    OutputSVG.setObject(segs3d, polys3d, GGBPDF.drawedges, GGBPDF.drawint, ggb.pts, ggb.lofst);
    return ggb;
  }

  // 描画
  // オブジェクトの更新はせず、視点の変更だけ再計算
  // ggbはParseGGB.parseGGBの返り値、あるいは、視点情報を持つ連想配列
  static draw(ggb) {
    if (GGBPDF.win == null) { return };
    // 一度閉じられていた
    if (GGBPDF.win.closed) { 
      GGBPDF.win = null;
      return;
    }
    GGBPDF.hidden = document.getElementById('hidden-line').checked; // 陰線表示チェックボックス
    GGBPDF.gap = Number(document.getElementById('gap').value); // 切り欠き
    if (GGBPDF.gap <= 0) { GGBPDF.gap = null };
    OutputSVG.render(ggb.eyex, ggb.scrnx, GGBPDF.gap, GGBPDF.hidden, ggb.scale,
		     ggb.xAngle, ggb.zAngle, ggb.xZero, ggb.yZero, ggb.zZero);
  }

  // 図形が更新されたときのイベントリスナ
  static update_draw(...args) {
    var ggb = GGBPDF.updateObject(); // xmlを解釈したものを受け取る
    GGBPDF.draw(ggb);
  }

// その他のベントリスナ
  static maybe_draw(ev) {
    switch (ev['type']) {
    case 'viewChanged3D':
      var xml = ggbApplet.getXML();    // xml取得と解釈 (ここは軽くできるけど)
      var ggb = ParseGGB.parseGGB(xml);
      GGBPDF.draw(ggb);
      break;
    case 'updateStyle':
      ggb = GGBPDF.updateObject();
      GGBPDF.draw(ggb);
      break;
    }
  }
} // end of class GGBPDF

// ggbApplet.registerAddListener 等がクラス関数を受け付けないので
var maybe_draw = GGBPDF.maybe_draw;
var update_draw = GGBPDF.update_draw;
