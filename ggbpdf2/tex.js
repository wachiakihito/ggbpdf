// -*- coding: utf-8; mode: javascript; mode: outline-minor; js-indent-level: 2 -*-
//// tex出力
class TEX {
  static lines = []; // texソースの各行を格納
  static cur_thick = -1; // 直近の線分の太さ
  static DLINE_DASH = '{6}';
  static HEADER = `\\documentclass[a4paper,landscape]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage[dvipdfmx]{curve2e}
\\begin{document}
`;
  static FOOTER = '\\end{document}';

  //// 線分の太さ設定
  static thickness(num) {
    if (num == TEX.cur_thick) { return };
    TEX.lines.push(`\\linethickness{${num/10}mm}`);
    TEX.cur_thick = num;
  }

  //// 破線のスタイル
  static dashstyle(num) {
    switch (num) {
      case 0:  return '';
      case 15: return '{6}';
      case 10: return '{4}';
      case 20: return '{2}';
      case 30: return '{1}';
    }
    return '';
  }

  //// 線分を描画キューに追加
  static line(seg, style) {
    var scale = SVG.ggb.camera.scale;
    var [[x1, y1], [x2, y2]] = seg;
    if (Math.abs(x1-x2) + Math.abs(y1-y2) < EPS) { return };
    [x1, y1] = [x1*scale, y1*scale];
    [x2, y2] = [x2*scale, y2*scale];
    TEX.thickness(style.thickness);
    if (style.lineType == 0) {
      TEX.lines.push(`\\Line(${x1},${y1})(${x2},${y2})`); // 実線
    } else {
      var dash = TEX.dashstyle(style.lineType);
      TEX.lines.push(`\\Dline(${x1},${y1})(${x2},${y2})${dash}`); // スタイルで破線
    }      
  }

  //// 破線を描画キューに追加
  static dline(seg, style) {
    var scale = SVG.ggb.camera.scale;
    var [[x1, y1], [x2, y2]] = seg;
    if (Math.abs(x1-x2) + Math.abs(y1-y2) < EPS) { return };
    [x1, y1] = [x1*scale, y1*scale];
    [x2, y2] = [x2*scale, y2*scale];
    TEX.thickness(style.thickness);
    TEX.lines.push(`\\Dline(${x1},${y1})(${x2},${y2})${TEX.DLINE_DASH}`);
  }

  //// テキストを描画キューに追加
  static text(xy2d, uv, txt) {
    var scale = SVG.ggb.camera.scale;
    var [x, y] = [xy2d[0]*scale, xy2d[1]*scale];
    x += uv[0];
    y -= uv[1]; // texはy軸上向き、オフセットはy軸は下向き
    // 誤差吸収ハードコード
    x += 5
    y += 5
    TEX.lines.push(`\\put(${x},${y}){${txt}}`);
  }

  //// picture環境を出力
  // SVGでの情報を流用する
  static render() {
    var hidden = document.getElementById('hidden-line').checked; // 陰線表示するか
    TEX.lines = []; // texソースの各行を格納
    if (SVG.hlr.vsegs2d.length == 0) { return };
    // 見える線を描画
    SVG.hlr.vsegs2d.forEach ((seg) => TEX.line(seg, SVG.hlr.vstyles[seg]));
    // 見えない線を描画
    if (hidden === true) {
      SVG.hlr.isegs2d.forEach ((seg) => TEX.dline(seg, SVG.hlr.istyles[seg]));
    }
    // 表示ラベルの描画
    var ggb = SVG.ggb;
    for (let lbl of Object.keys(ggb.pts)) {
      if (! ggb.elts[lbl].showobj || ! ggb.elts[lbl].showlbl) { continue };
      // texでも文字列でも同じ
      TEX.text(SVG.labelxy[lbl], ggb.elts[lbl].labelOffset, ggb.elts[lbl].labelText);
    }
    // 寸法計算
    var xmin = INF;
    var xmax = -INF;
    var ymin = INF;
    var ymax = -INF;
    SVG.hlr.vsegs2d.forEach (([[x1,y1],[x2,y2]]) => {
      xmin = Math.min(xmin, x1, x2);
      xmax = Math.max(xmax, x1, x2);
      ymin = Math.min(ymin, y1, y2);
      ymax = Math.max(ymax, y1, y2);
    });
    // ヘッダ
    var lines2 = [TEX.HEADER];
    // unitlength
    // !! まだ
    // picture環境
    var scale = SVG.ggb.camera.scale;
    var wh = `(${(xmax-xmin)*scale},${(ymax-ymin)*scale})`;
    var o = `(${xmin*scale},${ymin*scale})`;
    lines2.push(`\\begin{picture}${wh}${o}`);
    TEX.lines = lines2.concat(TEX.lines);
    TEX.lines.push('\\end{picture}')
    // フッタ
    TEX.lines.push(TEX.FOOTER);
  }
  
  //// texのダウンロード
  static downloadTEX() {
    if (SVG.hlr.vsegs2d.length == 0) { return };
  // texのテキスト作成
    TEX.render();
    var text = TEX.lines.join("\n");
    // blob作成
    const filename = 'ggbtex.tex';
    const blob = new Blob([text], { type: 'text/plain' });
    // A要素で無理矢理ダウンロード
    const elt = document.createElement('a');
    elt.href = URL.createObjectURL(blob);
    elt.target = '_blank';
    elt.download = filename;
    elt.click();
    URL.revokeObjectURL(elt.href);
  }
}
