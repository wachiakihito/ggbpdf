// -*- coding: utf-8; mode: javascript; mode: outline-minor; js-indent-level: 2 -*-
// Copyright (c) 2023 akihito wachi
// Released under the MIT license
// https://opensource.org/licenses/mit-license.php

// 陰線処理ライブラリ

//// 定数
const EPS = 1.0e-10;            // 機械イプシロン。場合によって調節する必要がありそう
const INF = Infinity;           // 無限大
const DEG = Math.PI / 180;      // 度数法からラジアンへの定数倍
const DIGITS = 6;               // obj形式にするときの小数以下桁数
const IN = 1;                   // V.outside_line_t で使用
const OUT = 0;                  // V.outside_line_t で使用

//// 比較関数 (ソート用)
const CMPN = function(a, b) { return a-b };             // 数値
const CMPA = function(a, b) {                           // 配列の配列
  let l = Math.min(a.length, b.length);
  for (let i = 0; i < l; i++) { if (a[i] != b[i]) { return a[i]-b[i] }; }
  return 0;
}

//// 区間、区間集合
// 区間は [a,b] (a<b)、区間集合は区間の配列
// 重なりがあるものは正規化したいが、データ構造としてはそこまでは求めない。
class Ivl {
  //// 複数の区間の和集合 (区間集合で返す)
  static union(...ivls) {
    ivls = [...ivls]; // 複製
    ivls.sort(CMPA);
    var i = 0;
    while (i <= ivls.length-2) {
      if (ivls[i][1] < ivls[i+1][0]) {
        i += 1;
      } else {
        ivls[i][1] = Math.max(ivls[i][1], ivls[i+1][1]);
        ivls.splice(i+1, 1); // 1要素削除
      }
    };
    return ivls;
  };

  //// 2つの区間集合の共通部分 (区間集合で返す)
  // 現状 O(mn) だが O(N log N) にはできそう (N = max{m,n})
  static intersection(ivls1, ivls2) {
    var ans = [];
    for(let i = 0; i < ivls1.length; i++) {
      for(let j = 0; j < ivls2.length; j++) {
        let c = Math.max(ivls1[i][0], ivls2[j][0]);
        let d = Math.min(ivls1[i][1], ivls2[j][1]);
        if (c < d) { ans.push([c,d] ); };
      };
    };
    return ans;
  };

  //// 2つの区間集合の差集合
  static sub(ivls1, ivls2) {
    // ivls2の補集合を作成
    var ivls2cf = [-INF, ...ivls2.flat()].concat(INF);
    var ivls2c = [];
    for (let i = 0; i <= ivls2.length; i++) {
      ivls2c.push([ivls2cf[i*2], ivls2cf[i*2+1]]);
    }
    if (ivls2c.length > 0 && ivls2c[0] == [-INF, -INF]) { ivls2c.shift() };
    if (ivls2c.length > 0 && ivls2c[-1] == [INF, INF]) { ivls2c.pop() };
    return Ivl.intersection(ivls1, ivls2c);
  };

  //// 区間集合に複数の切り欠きを入れる
  // 切り欠きの両端が同一区間に入っているときのみ
  // 1つずつ切り欠きを入れると、そのたびに同一区間条件が変わるので一斉にやる
  // ts の要素 t の位置に t-w から t+w まで切り欠きを入れる。
  static insert_gaps(ivls, ts, w) {
    if (ts.length == 0) { return ivls };
    var gaps = []; // 同一区間条件を満たす切り欠きの区間集合
    for (let i = 0; i < ts.length; i++) {
      for (let j = 0; j < ivls.length; j++) {
        if (ivls[j][0] <= ts[i]-w && ts[i]+w <+ ivls[j][1]) {
          gaps.push([ts[i]-w, ts[i]+w]);
          break;
        }
      }
    }
    return Ivl.sub(ivls, gaps);
  };

  //// 3dの区間を2dの区間に変換
  // p0, p1が3dで t = 0, 1 の点
  static to_2d(ivls, p0, p1, eyex) {
    var l0 = eyex - p0[0];
    var l1 = eyex - p1[0];
    var ans = [];
    for (let i = 0; i < ivls.length; i++) {
      ans.push([]);
      for (let j = 0; j < 2; j++) {
        let t = ivls[i][j];
        if (t == INF || t == -INF) {
          ans[ans.length-1].push(t)
        } else {
          ans[ans.length-1].push( t*l1 / ((1-t)*l0 + t*l1) );
        }
      }
    }
    return ans;
  };

  //// 2dのパラメータを3dに変換
  // p0, p1が3dで t = 0, 1 の点
  static to_3d_t(t, p0, p1, eyex) {
    var l0 = eyex - p0[0];
    var l1 = eyex - p1[0];
    if (t == INF || t == -INF) {
      return t
    } else {
      return t*l0 / ( t*l0 + (1-t)*l1 )
    }
  }
} // end of class Ivl

//// 線型代数
// ベクトルは [x,y] または、[x,y,z]
// 空間の平面の方程式は、ax + by + cz + d = 0 を [a, b, c, d] で表す
class V {
  //// [ベクトルの演算]
  //// 内積 (長さが違うときは、短い方に合わせる)
  static inn(v1, v2) {
    var l = Math.min(v1.length, v2.length);
    var ans = 0;
    for (let i = 0; i < l; i++) { ans += v1[i]*v2[i] };
    return ans;
  }

  //// 和
  static add(v1, v2) {
    var l = Math.min(v1.length, v2.length);
    var ans = [];
    for (let i = 0; i < l; i++) { ans.push(v1[i] + v2[i]) };
    return ans;
  }

  //// 差
  static sub(v1, v2) {
    var l = Math.min(v1.length, v2.length);
    var ans = [];
    for (let i = 0; i < l; i++) { ans.push(v1[i] - v2[i]) };
    return ans;
  }

  //// スカラー倍
  static scl(k, v) {
    var ans = [];
    for (let i = 0; i < v.length; i++) { ans.push(k*v[i]); }
    return ans;
  }

  //// [空間ベクトルの演算]
  //// 外積
  static ext(v1, v2) {
    return  [ v1[1]*v2[2]-v2[1]*v1[2],
              v1[2]*v2[0]-v2[2]*v1[0],
              v1[0]*v2[1]-v2[0]*v1[1] ]
  }

  //// 行列式
  static det(v0, v1, v2) {
    return (v0[0]*v1[1]*v2[2] + v1[0]*v2[1]*v0[2] + v2[0]*v0[1]*v1[2]) -
      (v0[0]*v2[1]*v1[2] + v1[0]*v0[1]*v2[2] + v2[0]*v1[1]*v0[2])
  }

  //// [法線ベクトル]
  //// 空間内の3点で定まる平面の法線ベクトル (pt1, pt2, pt3 の向きに回して右ねじが進む向き)
  static normal(pt1, pt2, pt3) {
    return V.ext(V.sub(pt2,pt1), V.sub(pt3,pt1));
  }

  //// 空間内の多角形の法線ベクトル (右ねじの向き)
  // 誤差対策で、三角形分割して各法線の和を返す
  static normal2(...poly) {
    var nor = [0,0,0];
    for (let i = 1; i < poly.length-1; i++) {
      nor = V.add(nor, V.normal(poly[0], poly[i], poly[i+1]))
    }
    return nor;
  }

  //// [平面の方程式]
  //// 空間内の3点で定まる平面 ax + by + cz + d = 0 の [a,b,c,d] を返す
  static plane_eq(pt1, pt2, pt3) {
    var a, b, c;
    [a, b, c] = V.normal(pt1, pt2, pt3);
    var d = - V.inn([a,b,c], pt1);
    return [a, b, c, d];
  }

  //// 空間内の多角形の平面の方程式 (法線ベクトルは右ねじの向き)
  // ax + by + cz + d = 0 の [a,b,c,d] を返す
  static plane_eq2(...poly) {
    var a, b, c;
    [a, b, c] = V.normal2(...poly);
    var d = - V.inn([a,b,c], poly[0]);
    return [a, b, c, d];
  }

  //// 空間内の平面の方程式の点の座標を代入
  static plane_pt(plane, pt) {
    return V.inn(plane, pt) + plane[3] // 行儀悪いが内積が短い方に合わせるので
  }

  //// 空間内の3平面の交点
  static int_plane_plane_plane(plane1, plane2, plane3) {
    var a1, b1, c1, d1;
    var a2, b2, c2, d2;
    var a3, b3, c3, d3;
    [a1, b1, c1, d1] = plane1;
    [a2, b2, c2, d2] = plane2;
    [a3, b3, c3, d3] = plane3;
    var det = V.det( [a1, b1, c1],
                     [a2, b2, c2],
                     [a3, b3, c3] );
    if (det == 0) { throw 'det is zero' };
    var xdet = V.det( [-d1, b1, c1],
                      [-d2, b2, c2],
                      [-d3, b3, c3] );
    var ydet = V.det( [a1, -d1, c1],
                      [a2, -d2, c2],
                      [a3, -d3, c3] );
    var zdet = V.det( [a1, b1, -d1],
                      [a2, b2, -d2],
                      [a3, b3, -d3] );
    return [ xdet/det, ydet/det, zdet/det ];
  }

  //// 空間内の平面 ax+by+cz+d=0 と、2点pt0, pt1 を結ぶ直線の交点 pt0 + t (pt1-pt0) の t
  // 共有点なければ nil、含まれていたら true
  static int_plane_line_t(plane, pt0, pt1) {
    var abc = plane.slice(0, 3);
    var d = plane[3];
    var v = V.sub(pt1, pt0);
    var deno = V.inn(abc, v);
    var nume = -d - V.inn(abc, pt0);
    if (Math.abs(deno) > EPS) {
      return nume / deno;
    } else if (nume == 0) {
      return true;
    } else {
      return null;
    }
  }

  //// 空間内の平面 ax+by+cz+d=0 と、2点pt0, pt1 を結ぶ直線の交点
  // 共有点なければ nil、含まれていたら pt0
  static int_plane_line(plane, pt0, pt1) {
    var t = V.int_plane_line_t(plane, pt0, pt1);
    if (typeof t == "number") {
      return V.add(pt0, V.scl(t, V.sub(pt1, pt0)));
    } else if (t === null) { // 共有点なし
      return t;
    } else { // 含まれている (t === true)
      return pt0;
    }
  }

  //// 空間内の直線pt0-pt1が平面planeの正の側にある t の範囲
  // 区間集合で返す。
  // 直線が平面に含まれるなら [-INF, INF]
  // 直線が平面と平行ならば、正の側かどうかに応じて  [-INF, INF] か []
  static pospart_plane_line_t(plane, pt0, pt1) {
    var t = V.int_plane_line_t(plane, pt0, pt1);
    var p_pt0 = V.plane_pt(plane, pt0);
    var p_pt1 = V.plane_pt(plane, pt1);
    if (t === true) { // 直線が平面に含まれるとき
      return [[-INF, INF]];
    } else if (t === null) { // 直線が平面と平行のとき
      return( p_pt0 >= 0 ? [[-INF, INF]] : []);
    } else if (Math.abs(p_pt0) <= EPS && Math.abs(p_pt1) <= EPS) { // 保険
      return [[-INF, INF]];
    } else { // 交わるとき
      return( p_pt0 > p_pt1 ? [[-INF, t]] : [[t, INF]] );
    }
  }

  //// 空間内の平面と多角形の交線 (辺は除外)
  // 空間内の2つの多角形の交線。線分の配列で返す。多角形の辺は含めない
  static int_poly_poly(poly1, poly2) {
    var plane1 = V.plane_eq2(...poly1);
    var plane2 = V.plane_eq2(...poly2);
    var nor1 = plane1.slice(0,3);
    var nor2 = plane2.slice(0,3);
    var v = V.ext(nor1, nor2); // 交線の方向ベクトル
    var len2 = V.inn(v, v);
    if (len2 < EPS) { return [] }; // 面がほぼ平行なら交線なし
    v = V.scl(len2**(-0.5), v) // 交線の単位方向ベクトル
    //
    var ivls1 = V.int_plane_poly_t(plane1, poly2, v) // 平面と多角形の交線のパラメータ
    var ivls2 = V.int_plane_poly_t(plane2, poly1, v) // 平面と多角形の交線のパラメータ
    var ivls = Ivl.intersection(ivls1, ivls2);
    //
    var pt = V.int_plane_plane_plane(plane1, plane2, v.concat(0)); // 交線の基点
    return ivls.map (([a,b]) =>
      [V.add(pt, V.scl(a, v)), V.add(pt, V.scl(b, v))].sort(CMPA) // 同じ線分の識別のためsort
    );
  }

  //// 空間内の平面と多角形の交線の、パラメータによる区間集合
  // パラメータ付けは方向ベクトル v との内積
  static int_plane_poly_t(plane, poly, v) {
    var n_plane = plane.slice(0,3);
    var n_poly = V.normal2(...poly);
    var ds = poly.map((pt) => V.plane_pt(plane, pt) );
    var ts = []; // [パラメータ, 前の頂点をplaneに代入した値]の配列
    // 多角形の各辺について平面と交わっていたら交点やパラメータを収集
    for (let i = 0; i < poly.length; i++) {
      let j = (i+1) % poly.length;
      if (ds[i]*ds[j] > 0) { continue }; // planeの同じ側にいるので交点はない
      var s = V.int_plane_line_t(plane, poly[i], poly[j]);
      if (s === true) { s = 0 }; // 直線が平面に含まれていたらtrueが返る
      if (s===null || s < 0-EPS || s > 1+EPS || ds[i]==0) { continue }; // ds[i]=0を無視できる設計
      var pt = V.add(poly[i], V.scl(s, V.sub(poly[j], poly[i])));
      ts.push( [V.inn(pt, v), ds[i]] );
    }
    // 交点がないなら交線もない
    if (ts.length == 0) { return [] };
    // 最初のtが正になるよう、必要であれば符号を反転
    ts.sort(CMPA);
    if (ts[0][1] < 0) {
      ts = ts.map (([s, t]) => [s, -t] );
    }
    //
    var ivls = []
    // 各交点に対して
    ts.forEach(([s, t]) => {
      if (t > 0) { // t > 0 なら区間開始 (開始済みなら前回の開始を上書き)
        if (ivls.length>0 && ivls[ivls.length-1].length==1) { ivls.pop(); };
        ivls.push([s]);
      } else if (t < 0) { // t < 0 なら区間終了 (未開始なら今回のを無視)
        if (ivls.length>0 && ivls[ivls.length-1].length == 1) {
          ivls[ivls.length-1].push(s)
        }
      }
    });
    // 最後の区間が閉じていなければ削除
    if (ivls.length>0 && ivls[ivls.length-1].length == 1) { ivls.pop() };
    return ivls;
  }

  //// [空間内の点の移動、回転]
  //// x軸回りに点たちを回転
  static rotate_x(rad, ...pts) {
    var c = Math.cos(rad);
    var s = Math.sin(rad);
    return pts.map (([x,y,z]) => [x, c*y-s*z, s*y+c*z] );
  }

  //// y軸回りに点たちを回転
  static rotate_y(rad, ...pts) {
    var c = Math.cos(rad);
    var s = Math.sin(rad);
    return pts.map (([x,y,z]) => [c*x-s*z, y, s*x+c*z] );
  }

  //// z軸回りに点たちを回転
  static rotate_z(rad, ...pts) {
    var c = Math.cos(rad);
    var s = Math.sin(rad);
    return pts.map (([x,y,z]) => [c*x-s*y, s*x+c*y, z] );
  }

  //// 空間の点を、平行移動、回転する
  static transform(xyz, xAngle, zAngle, xZero, yZero, zZero) {
    var [x,y,z] = xyz;
    [x,y,z] = V.rotate_z(-zAngle*DEG, [x+xZero, y+yZero, z+zZero])[0];
    [x,y,z] = V.rotate_y(-xAngle*DEG, [x, y, z])[0];
    return [x, y, z];
  }

  //// [平面内の線分、直線、多角形]
  //// 平面内の多角形の符号付き面積の倍 (外積で求める)
  static area2(...poly) {
    var z = 0;
    var [x0, y0] = poly[0];
    for (let i = 1; i <= poly.length-2; i++) {
      var [x1, y1] = poly[i];
      var [x2, y2] = poly[i+1];
      z += (x1-x0)*(y2-y0) - (y1-y0)*(x2-x0)
    }
    return z;
  }

  //// 平面内の2直線の交点のパラメータ
  // u0 + s (u1-u0) = v0 + t (v1-u0) を満たすパラメータ s,t を返す)
  // 交点がなければ [null, null]
  static int_line_line_st(u0, u1, v0, v1) {
    var d = V.area2([0,0], V.sub(u1, u0), V.sub(v1, v0));
    if (d == 0) { return [null, null] };
    var s = -V.area2(v0, u0, v1) / d;
    var t = -V.area2(v0, u0, u1) / d;
    return [s, t]
  }

  //// 平面内の2直線の交点
  // 交点がなければnil
  static int_line_line(u0, u1, v0, v1) {
    var [s, t] = V.int_line_line_st(u0, u1, v0, v1);
    if (typeof s == "number") {
      return V.add(u0, V.scl(s, V.sub(u1, u0)));
    } else {
      return null;
    }
  }

  //// 平面内の線分と多角形を与えると、線分の多角形外部の部分を t の区間集合として返す
  // 多角形は、頂点を巡ったとき左手側が内部  (外積のz座標が正) になるようにしておく
  static outside_line_t(pt0, pt1, poly) {
    var pt0pt1 = V.sub(pt1, pt0);
    var p90 = [pt0pt1[1], -pt0pt1[0]]; // これと辺のベクトルの内積が正 (鋭角) なら、内部に入る
    var ts = [];
    var out_ivls = [];
    for (let i = -1; i <= poly.length-2; i++) {
      var v0 = poly[(i+poly.length) % poly.length];
      var v1 = poly[i+1];
      var [s, t] = V.int_line_line_st(v0, v1, pt0, pt1);
      if (s===null && Math.abs(V.area2(v0, v1, pt0)) < EPS) { // 線分が辺と同一直線なら外部
        var t0 = V.inn(pt0pt1, V.sub(v0,pt0)) / V.inn(pt0pt1, pt0pt1);
        var t1 = V.inn(pt0pt1, V.sub(v1,pt0)) / V.inn(pt0pt1, pt0pt1);
        var t0t1 = [t0, t1];
        t0t1.sort(CMPN);
        out_ivls.push(t0t1);
        continue;
      }
      if (s===null || s <  0-EPS || s > 1+EPS) { continue };
      var inout = V.inn(p90, V.sub(v1, v0)) > 0 ? IN : OUT;
      ts.push([t, inout]);
    }
    ts = ts.concat([[INF, IN]]);
    ts.sort(CMPA);
    var ts2 = [[-INF, OUT]];
    while (ts.length != 0) {
      if (ts2[ts2.length-1][1] == ts[0][1]) {
        ts.shift();
      } else {
        ts2.push(ts.shift());
      }
    }
    if (ts2[ts2.length-1][1] == OUT) {
      ts2.push([INF, IN]);
    } else if (ts2[ts2.length-1][0] != INF) {
      ts2[ts2.length-1][0] = INF;
    }
    var ts3 = [];
    for (let i = 0; i < ts2.length-1; i+=2) {
      ts3.push([ts2[i][0], ts2[i+1][0]]);
    }
    return Ivl.union(...ts3, ...out_ivls);
  }

  //// [射影]
  //// 視点x座標、スクリーンx座標、点たちを与えると、射影した2次元の点たちを返す
  // eyex 視点の位置 (eyex, 0, 0) から (0,0,0) を見る
  // scrnx スクリーンの位置。x = scrnx
  static proj(eyex, scrnx, ...pts) {
    if (scrnx <=0 || eyex <= scrnx) { throw 'proj' };
    return pts.map (([x,y,z]) => {
      let r = (eyex-scrnx)/(eyex-x);
      return [y*r, z*r]
    });
  }

} // end of class V

//// 陰線処理
class HLR {
  //// 生成関数
  constructor(camera, gap, polys3d, segs3d, segstyles, s_on_p) {
    this.eyex = camera.eyex;
    this.scrnx = camera.scrnx;
    this.xAngle = camera.xAngle;
    this.zAngle = camera.zAngle;
    this.xZero = camera.xZero;
    this.yZero = camera.yZero;
    this.zZero = camera.zZero;
    this.gap = gap;
    this.segstyles = segstyles;
    this.s_on_p = s_on_p;
    // 平行移動、回転
    this.polys3d = polys3d.map ((poly) => { // 面
      return poly.map ((xyz) =>
        V.transform(xyz, this.xAngle, this.zAngle, this.xZero, this.yZero, this.zZero))
    });
    this.segs3d = segs3d.map ((seg) => { // 線分
      return seg.map ((xyz) =>
        V.transform(xyz, this.xAngle, this.zAngle, this.xZero, this.yZero, this.zZero))
    });
    // 陰線処理
    this.visible_segs();
  }

  //// 陰線処理
  // 陰線処理して射影した後の描画すべき線分たちを返す。
  // 引数   eyex   視点の位置 (eye, 0, 0) から (0,0,0) を見る
  //        scrnx  スクリーンの位置。x = scrnx
  //        gap    線分どうしが重なったときに欠く幅。単位は3次元座標での距離1。
  //               欠かないならnil
  //        segs3d 空間の線分たち
  //        poly3d 空間の多角形たち。辺は描画されないのでsegs3dに入れること。
  //        s_on_p 線分番号=>[それを含む面番号]の配列
  // 返り値 vsegs2d    見える線分たちの配列。切り欠き済み
  //        vstyles    見える線分たちのスタイルの連想配列
  //        isegs2d 見えない線分たちの配列
  //        istyles    見える線分たちのスタイルの連想配列
  visible_segs() {
    // 視点
    var pteye = [this.eyex, 0, 0];
    // 多角形を射影。頂点を巡ったとき左手側が内部  (外積のz座標が正) にする
    var polys2d = this.polys3d.map ((pts) => {
      let poly = V.proj(this.eyex, this.scrnx, ...pts);
      return (V.area2(...poly) >= 0) ? poly : poly.reverse();
    });
    // 多角形の平面の方程式。視点が正の側にする
    var planes3d = this.polys3d.map ((pts) => {
      let plane = V.plane_eq(...pts.slice(0,3)); // 最初の3点で平面を決定
      if (V.plane_pt(plane, pteye) < 0) {
        plane = plane.map ((a) => -a);
      };
      return plane;
    });
    // 線分を射影
    var segs2d = this.segs3d.map ((pts) => V.proj(this.eyex, this.scrnx, ...pts));
    // 返り値
    this.vsegs2d = []; // 見える線分 (切り欠き済み)
    this.vstyles = {};
    this.isegs2d = []; // 見えない線分
    this.istyles = {};
    // 各3D線分に対して
    for (let i = 0; i < this.segs3d.length; i++) {
      let [p0, p1] = this.segs3d[i];
      let [q0, q1] = segs2d[i];
      let ivls = [[0,1]];
      // 各面で隠れない部分を求める
      for (let k = 0; k < this.polys3d.length; k++) {
        // 線分を含む平面は無視 !! とりあえずやらない
        if (this.s_on_p[i].includes(k)) { continue };
        let pos_ivls = V.pospart_plane_line_t(planes3d[k], p0, p1); // 面の手前側の区間 (3d)
        let pos_ivls_3d = Ivl.to_2d(pos_ivls, p0, p1, this.eyex);
        let vis_ivls = (q0==q1) ? [] : V.outside_line_t(q0, q1, polys2d[k]); // 面の外部の区間 (2d)
        ivls = Ivl.intersection(ivls, Ivl.union(...pos_ivls_3d, ...vis_ivls)); // それらの共通部分
      }
      // 隠れている線を求める
      var inv_ivls = Ivl.sub([[0,1]], ivls);
      for (let ts of inv_ivls) {
        let seg = ts.map ((t) => V.add(q0, V.scl(t, V.sub(q1,q0))) ).sort(CMPA); // 同じ線分の識別のためsort
        this.istyles[seg] = this.segstyles[i];
        this.isegs2d.push(seg);
      }
      // 切り欠き
      if (this.gap !== null && ivls.length != 0) {
        let gap_w = this.gap / Math.sqrt(V.inn(V.sub(p0, p1), V.sub(p0, p1))) / 2;
        let ts = []; // 切り欠きを入れる場所
        for (let k = 0; k < this.segs3d.length; k++) {
          let [u0, u1] = this.segs3d[k];
          let [v0, v1] = segs2d[k];
          let [s, t] = V.int_line_line_st(v0, v1, q0, q1) // 2d

	  if (k==3) { console.log('u(3d), v(2d), q(2d), [s,t] = ', [[u0,u1],[v0,v1],[q0,q1],[s,t]] )}

          if (s===null || s < 0 || s > 1 || t < 0 || t > 1) { continue };
          let s3d = Ivl.to_3d_t(s, u0, u1, this.eyex);
          let t3d = Ivl.to_3d_t(t, p0, p1, this.eyex);
          if (u0[0]+s3d*(u1[0]-u0[0]) <= p0[0]+t3d*(p1[0]-p0[0] + EPS)) { continue }; // 奥行チェック
          ts.push(t);
        }
        ivls = Ivl.insert_gaps(ivls, ts, gap_w);
      }
      // 拡張された線分にして蓄積 (!! 拡張とは?)
      for (let ts of ivls) {
        let seg = ts.map ((t) => V.add(q0, V.scl(t, V.sub(q1,q0))) ).sort(CMPA); // 同じ線分の識別のためsort
        this.vstyles[seg] = this.segstyles[i];
        this.vsegs2d.push(seg);
      }
    }
    this.vsegs2d = Array.from(new Set(this.vsegs2d));
    this.isegs2d = Array.from(new Set(this.isegs2d));
  }
} // end of class HLR
