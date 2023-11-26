// -*- coding: utf-8; mode: javascript; mode: outline-minor; js-indent-level: 2 -*-
// Copyright (c) 2023 akihito wachi
// Released under the MIT license
// https://opensource.org/licenses/mit-license.php

async function renderPDF() {
  var elt = GGBPDF.win.document.getElementById('pdf');
  if (! elt) { return };
  // pdf作成
  const pdfDoc = await PDFLib.PDFDocument.create();
  const page = pdfDoc.addPage([GGBPDF.PDFW, GGBPDF.PDFW]);
  // 描画すべき線分
  var vsegs2d = HLR.vsegs2d;
  var isegs2d = HLR.isegs2d;
  var hidden = document.getElementById('hidden-line').checked; // 陰線表示チェックボックス
  // 線分
  [vsegs2d, isegs2d].forEach ((segs, i) => {
    if (i == 0 || hidden) {
      segs.forEach ((seg) => {
	var [[x1,y1],[x2,y2]] = seg;
	x1 *= OutputSVG.scale;
	y1 *= OutputSVG.scale;
	x2 *= OutputSVG.scale;
	y2 *= OutputSVG.scale;
	x1 += 200;
	y1 += 200;
	x2 += 200;
	y2 += 200;
	if (i == 0) {
	  page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2}});
	} else {
	  page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},dashArray:[2,2]});
	};
      });
    }
  });
  // 表示ラベルの描画
  for (let lbl of Object.keys(OutputSVG.labels)) {
    let [x, y] = OutputSVG.labels[lbl];
    let [u, v] = OutputSVG.lofst[lbl];
    x *= OutputSVG.scale;
    y *= OutputSVG.scale;
    x += 200 + u;
    y += 200 - v;
    x += 5; // 誤差吸収ハードコード
    y += 7; // 誤差吸収ハードコード
    page.drawText(lbl, {x:x, y:y, size:14});
  }
  //
  const pdfDataUri = await pdfDoc.saveAsBase64({ dataUri: true });
  GGBPDF.win.document.getElementById('pdf').src = pdfDataUri;
}
