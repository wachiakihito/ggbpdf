// -*- coding: utf-8; mode: javascript; mode: outline-minor; js-indent-level: 2 -*-
//// pdf描画
class PDF {
  // 線分のテンプレート
  static DLINE_DASH = [6, 3];
  //// 座標をviewBox中心を原点とする右手系に変換
  // 画像サイズはsvgと同じで決め打ち
  static conv(x, y) {
    return [x + SVG.width/2, y + SVG.height/2]
  }

  //// 線分のスタイル
  static dashstyle(num) {
    switch (num) {
      case 0:  return null;
      case 15: return [6, 6];
      case 10: return [4, 4];
      case 20: return [2, 2];
      case 30: return [6, 3, 1, 3];
    }
    return null;
  }

  //// 線分を描画キューに追加
  static line(seg, style) {
    var scale = SVG.ggb.camera.scale;
    var [[x1, y1], [x2, y2]] = seg;
    [x1, y1] = PDF.conv(x1*scale, y1*scale);
    [x2, y2] = PDF.conv(x2*scale, y2*scale);
    var dash = PDF.dashstyle(style.lineType);
    var option = {start:{x:x1, y:y1}, 
		  end:{x:x2, y:y2},
		  thickness:style.thickness/3,
		 };
    if (dash) { option.dashArray = dash };
    PDF.page.drawLine(option);
  }

  //// 破線を描画キューに追加
  static dline(seg, style) {
    var scale = SVG.ggb.camera.scale;
    var [[x1, y1], [x2, y2]] = seg;
    [x1, y1] = PDF.conv(x1*scale, y1*scale);
    [x2, y2] = PDF.conv(x2*scale, y2*scale);
    var option = {start:{x:x1, y:y1}, 
		  end:{x:x2, y:y2},
		  thickness:style.thickness/3,
		  dashArray:PDF.DLINE_DASH
		 };

    PDF.page.drawLine(option);
  }

  //// テキストを描画
  static text(xy2d, uv, txt) {
    var scale = SVG.ggb.camera.scale;
    var [x, y] = PDF.conv(xy2d[0]*scale, xy2d[1]*scale);
    x += uv[0];
    y -= uv[1]; // PDFはy軸上向き、オフセット下向き
    // 誤差吸収ハードコード
    x += 4
    y += 2
    PDF.page.drawText(txt, {x:x, y:y, size:14});
  }

  //// pdf描画
  // SVGの情報を流用する
  static async render() {
    if (! GGBPDF.pdf) { return };
    var hidden = document.getElementById('hidden-line').checked; // 陰線表示するか
    // pdf作成
    PDF.pdfDoc = await PDFLib.PDFDocument.create();
    if (! PDF.pdfDoc) { return };
    PDF.page = PDF.pdfDoc.addPage([GGBPDF.PDFW, GGBPDF.PDFW]);
    // 見える線を描画
    SVG.hlr.vsegs2d.forEach ((seg) => PDF.line(seg, SVG.hlr.vstyles[seg]));
    // 見えない線を描画
    if (hidden === true) {
      SVG.hlr.isegs2d.forEach ((seg) => PDF.dline(seg, SVG.hlr.istyles[seg]));
    }
    // 表示ラベルの描画
    var ggb = SVG.ggb;
    for (let lbl of Object.keys(ggb.pts)) {
      if (! ggb.elts[lbl].showobj || ! ggb.elts[lbl].showlbl) { continue };
      let xyz = V.transform(ggb.pts[lbl],
                            ggb.camera.xAngle, ggb.camera.zAngle,
                            ggb.camera.xZero, ggb.camera.yZero, ggb.camera.zZero);
      let xy2d = V.proj(ggb.camera.eyex, ggb.camera.scrnx, xyz)[0];
      // texであってもタイプセットせずに表示
      PDF.text(xy2d, ggb.elts[lbl].labelOffset, ggb.elts[lbl].labelText);
    }
    // 結果を表示
    const pdfDataUri = await PDF.pdfDoc.saveAsBase64({ dataUri: true });
    GGBPDF.pdf.src = pdfDataUri;
  }
} // end of class PDF
