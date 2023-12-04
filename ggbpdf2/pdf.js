//// pdf描画
class PDF {
  //// pdf描画
  static async render() {
    if (! GGBPDF.pdf) { return };
    // pdf作成
    const pdfDoc = await PDFLib.PDFDocument.create();
    if (! pdfDoc) { return };
    const page = pdfDoc.addPage([GGBPDF.PDFW, GGBPDF.PDFW]);
    // 描画すべき線分
    var vsegs2d = SVG.hlr.vsegs2d;
    var isegs2d = SVG.hlr.isegs2d;
    var hidden = document.getElementById('hidden-line').checked; // 陰線表示
    // 線分
    [vsegs2d, isegs2d].forEach ((segs, i) => {
      if (i == 0 || hidden) {
        segs.forEach ((seg) => {
          var [[x1,y1],[x2,y2]] = seg;
          x1 = x1 * GGBPDF.ggb.camera.scale + GGBPDF.PDFW/2;
          y1 = y1 * GGBPDF.ggb.camera.scale + GGBPDF.PDFW/2;
          x2 = x2 * GGBPDF.ggb.camera.scale + GGBPDF.PDFW/2;
          y2 = y2 * GGBPDF.ggb.camera.scale + GGBPDF.PDFW/2;
          if (i == 0) {
            page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2}});
          } else {
            page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},dashArray:[2,2]});
          };
        });
      }
    });
    // 表示ラベルの描画
    var ggb = GGBPDF.ggb;
    for (let lbl of Object.keys(ggb.pts)) {
      if (! ggb.elts[lbl].showobj || ! ggb.elts[lbl].showlbl) { continue };
      let xyz = V.transform(ggb.pts[lbl],
                            ggb.camera.xAngle, ggb.camera.zAngle,
                            ggb.camera.xZero, ggb.camera.yZero, ggb.camera.zZero);
      let [x, y] = V.proj(ggb.camera.eyex, ggb.camera.scrnx, xyz)[0];
      let [u, v] = ggb.elts[lbl].labelOffset;
      x = x * GGBPDF.ggb.camera.scale + GGBPDF.PDFW/2 + u;
      y = y * GGBPDF.ggb.camera.scale + GGBPDF.PDFW/2 - v;
      x += 5; // 誤差吸収ハードコード
      y += 7; // 誤差吸収ハードコード
      page.drawText(lbl, {x:x, y:y, size:14});
    }
    //
    const pdfDataUri = await pdfDoc.saveAsBase64({ dataUri: true });
    GGBPDF.pdf.src = pdfDataUri;
  }
} // end of class PDF
