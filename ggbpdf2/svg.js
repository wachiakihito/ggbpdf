// -*- coding: utf-8; mode: javascript; mode: outline-minor; js-indent-level: 2 -*-
//// svg描画
class SVG {
  // 線分のテンプレート
  static DLINE_ATTR = 'stroke="black" stroke-width="1.5" stroke-dasharray="6,3"';
  static DLINE_DASH = 'stroke-dasharray="6,3"';
  // renderの引数の保管
  static ggb;
  static hlr;
  static svg;
  // svg要素のサイズ
  static width;
  static height;
  // svg要素のinnerHTMLに置く文字列をためる描画キュー (!! 改名したい)
  static objs;

  //// 座標をviewBox中心を原点とする右手系に変換
  static conv(x, y) {
    return [x + SVG.width/2, -y + SVG.height/2]
  }

  //// 線分のスタイル
  static dashstyle(num) {
    switch (num) {
      case 0:  return '';
      case 15: return 'stroke-dasharray="6,6"';
      case 10: return 'stroke-dasharray="4,4"';
      case 20: return 'stroke-dasharray="2,2"';
      case 30: return 'stroke-dasharray="6,3,1,3"';
    }
    return '';
  }

  //// 線分を描画キューに追加
  static line(seg, style) {
    var scale = SVG.ggb.camera.scale;
    var [[x1, y1], [x2, y2]] = seg;
    [x1, y1] = SVG.conv(x1*scale, y1*scale);
    [x2, y2] = SVG.conv(x2*scale, y2*scale);
    var coord = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`;
    var stroke = 'stroke="black"';
    var width = `stroke-width="${style.thickness/3}"`;
    var dash = SVG.dashstyle(style.lineType);
    SVG.objs.push(`<line ${coord} ${stroke} ${width} ${dash}/>`);
  }

  //// 破線を描画キューに追加
  static dline(seg, style) {
    var scale = SVG.ggb.camera.scale;
    var [[x1, y1], [x2, y2]] = seg;
    [x1, y1] = SVG.conv(x1*scale, y1*scale);
    [x2, y2] = SVG.conv(x2*scale, y2*scale);
    var coord = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`;
    var stroke = 'stroke="black"';
    var width = `stroke-width="${style.thickness/3}"`;
    var dash = SVG.DLINE_DASH;
    SVG.objs.push(`<line ${coord} ${stroke} ${width} ${dash}/>`);
  }

  //// テキストを描画キューに追加
  static text(xy2d, uv, lbl) {
    var scale = SVG.ggb.camera.scale;
    var [x, y] = SVG.conv(xy2d[0]*scale, xy2d[1]*scale);
    x += uv[0];
    y += uv[1]; // SVGもオフセットもy軸は下向き
    // 誤差吸収ハードコード
    x += 5
    y -= 5
    SVG.objs.push(`<text x="${x}" y="${y}">${lbl}</text>`);
  }

  //// foreignObjectを描画キューに追加
  static foreignObject(xy2d, uv, tex) {
    var scale = SVG.ggb.camera.scale;
    var [x, y] = SVG.conv(xy2d[0]*scale, xy2d[1]*scale);
    x += uv[0];
    y += uv[1]; // SVGもオフセットもy軸は下向き
    // 誤差吸収ハードコード
    x += 5
    y -= 25
    SVG.objs.push(`<foreignObject x="${x}" y="${y}">${tex}</foreignObject>`);
  }

  //// hlrに計算されている図形を、回転、平行移動、拡大してsvgで描画
  // オブジェクトを、(xZero, yZero, zZero) 平行移動、
  // y軸について-xAngle回転、z軸について-zAngle回転、
  // scale倍の順に変換する
  // hiddenが真なら陰線も描画
  static render(svg, ggb, hlr, hidden) {
    SVG.svg = svg;
    SVG.ggb = ggb;
    SVG.hlr = hlr;
    var vb = svg.getAttribute('viewBox').split(' ');
    SVG.width = parseInt(vb[2]);
    SVG.height = parseInt(vb[3]);
    // 見える線を描画
    SVG.objs = [];
    hlr.vsegs2d.forEach ((seg) => SVG.line(seg, hlr.vstyles[seg]));
    // 見えない線を描画
    if (hidden === true) {
      hlr.isegs2d.forEach ((seg) => SVG.dline(seg, hlr.istyles[seg]));
    }
    // 表示ラベルの描画
    for (let lbl of Object.keys(ggb.pts)) {
      if (! ggb.elts[lbl].showobj || ! ggb.elts[lbl].showlbl) { continue };
      let xyz = V.transform(ggb.pts[lbl],
                            ggb.camera.xAngle, ggb.camera.zAngle,
                            ggb.camera.xZero, ggb.camera.yZero, ggb.camera.zZero);
      let xy2d = V.proj(ggb.camera.eyex, ggb.camera.scrnx, xyz)[0];
      if (ggb.elts[lbl].labelText[0] == '<') { // texは\smallで始まるはず
	SVG.foreignObject(xy2d, ggb.elts[lbl].labelOffset, ggb.elts[lbl].labelText);
      } else { // 文字列
	SVG.text(xy2d, ggb.elts[lbl].labelOffset, ggb.elts[lbl].labelText);
      }
    }
    // 更新
    SVG.svg.innerHTML = SVG.objs.join("\n");
    SVG.objs = [];
  }

  //// SVGのダウンロード
  static downloadSVG() {
  // svgのテキスト作成
    var td = SVG.svg.parentElement;
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
} // end of class SVG
