# -*- coding: utf-8; mode: ruby; mode: outline-minor -*-
# Copyright (c) 2023 akihito wachi
# Released under the MIT license
# https://opensource.org/licenses/mit-license.php

# 陰線処理ライブラリ prog/3d にあったもの。
# javascript化を見越して、演算子オーバーロードはせず、データ構造は配列のみのままにし、
# 関数をmodule関数にして名前空間を汚さないようにするだけ。
# サンプルは末尾

#### デバッグ
def err(*ss)
  ss.each {|s|
    if s == '' then
      $stderr.puts
    else
      $stderr.puts '[%s] %s' % [
                     caller[2].gsub(/:in.*$/,'').split('/')[-1],
                     s.inspect]
    end
  }
end

#### 定数
EPS = 1.0e-10 		# 機械イプシロン。場合によって調節する必要がありそう
INF = Float::INFINITY 	# 無限大
DEG = Math::PI / 180 	# 度数法からラジアンへの定数倍
DIGITS = 6 		# obj形式にするときの小数以下桁数

#### 区間、区間集合
# 区間は [a,b] (a<b)、区間集合は区間の配列
# 重なりがあるものは正規化したいが、データ構造としてはそこまでは求めない。
module Ivl
  ## 複数の区間の和集合 (区間集合で返す)
  def self.union(*ivls)
    ivls = ivls.map {|a,b| [a,b] }.sort # 単にivls.sortじゃダメ?
    i = 0
    while i <= ivls.size-2
      if ivls[i][1] < ivls[i+1][0] then
        i += 1
      else
        ivls[i][1] = [ivls[i][1], ivls[i+1][1]].max
        ivls.delete_at(i+1)
      end
    end
    ivls
  end

  ## 2つの区間集合の共通部分 (区間集合で返す)
  # 現状 O(mn) だが O(N log N) にはできそう (N = max{m,n})
  def self.intersection(ivls1, ivls2)
    ivls1.flat_map {|a1,b1| ivls2.map {|a2,b2|
                      c = [a1,a2].max
                      d = [b1,b2].min
                      c < d ? [c,d] : nil
                    }}.compact
  end

  ## 2つの区間集合の差集合
  def self.sub(ivls1, ivls2)
    ivls2c = ([-INF] + ivls2 + [INF]).flatten.each_slice(2).to_a
    ivls2c.shift if ! ivls2c.empty? && ivls2c[0] == [-INF,-INF]
    ivls2c.pop if ! ivls2c.empty? && ivls2c[-1] == [INF,INF]
    Ivl.intersection(ivls1, ivls2c)
  end
  
  ## 区間集合に複数の切り欠きを入れる
  # 切り欠きの両端が同一区間に入っているときのみ
  # 1つずつ切り欠きを入れると、そのたびに同一区間条件が変わるので一斉にやる
  # ts の要素 t の位置に t-w から t+w まで切り欠きを入れる。
  def self.insert_gaps(ivls, ts, w)
    return ivls if ts.empty?
    gaps = [] # 同一区間条件を満たす切り欠きの区間集合
    ts.sort.each {|t|
      ivls = ivls.sort # 不要かな?
      ab = ivls.bsearch {|a,b| t+w <= b }
      next if ab.nil?
      next if ab[0] > t-w
      gaps.push([t-w, t+w]) # if ab[0] <= t-w && t+w <= ab[1]
    }
    Ivl.sub(ivls, gaps)
  end

  ## 3dの区間を2dの区間に変換
  # p0, p1が3dで t = 0, 1 の点
  def self.to_2d(ivls, p0, p1, eyex)
    l0 = eyex - p0[0]
    l1 = eyex - p1[0]
    ivls.map {|ivl|
      ivl.map {|t|
        if t == INF || t == -INF then
          t
        else
          t*l1.to_f / ( (1-t)*l0 + t*l1 )
        end
      }
    }
  end

  ## 2dのパラメータを3dに変換
  # p0, p1が3dで t = 0, 1 の点
  def self.to_3d_t(t, p0, p1, eyex)
    l0 = eyex - p0[0]
    l1 = eyex - p1[0]
    if t == INF || t == -INF then
      t
    else
      t*l0.to_f / ( t*l0 + (1-t)*l1 )
    end
  end  

end # of module Ivl

#### 線型代数
# ベクトルは [x,y] または、[x,y,z]
# 空間の平面の方程式は、ax + by + cz + d = 0 を [a, b, c, d] で表す
module V
  ## [ベクトルの演算]
  ## 内積 (長さが違うときは、短い方に合わせる)
  def self.inn(v1, v2)
    l = [v1.size, v2.size].min
    l.times.inject(0) {|a, i| a + v1[i]*v2[i] }
  end

  ## 和
  def self.add(v1, v2)
    l = [v1.size, v2.size].min
    l.times.map {|i| v1[i] + v2[i] }
  end

  ## 差
  def self.sub(v1, v2)
    l = [v1.size, v2.size].min
    l.times.map {|i| v1[i] - v2[i] }
  end

  ## スカラー倍
  def self.scl(k, v)
    v.map {|x| k*x }
  end

  ## [空間ベクトルの演算]
  ## 外積
  def self.ext(v1, v2)
    [ v1[1]*v2[2]-v2[1]*v1[2],
      v1[2]*v2[0]-v2[2]*v1[0],
      v1[0]*v2[1]-v2[0]*v1[1] ]
  end

  ## 行列式
  def self.det(v0, v1, v2)
    (v0[0]*v1[1]*v2[2] + v1[0]*v2[1]*v0[2] + v2[0]*v0[1]*v1[2]) -
      (v0[0]*v2[1]*v1[2] + v1[0]*v0[1]*v2[2] + v2[0]*v1[1]*v0[2])
  end

  ## [法線ベクトル]
  ## 空間内の3点で定まる平面の法線ベクトル (pt1, pt2, pt3 の向きに回して右ねじが進む向き)
  def self.normal(pt1, pt2, pt3)
    V.ext(V.sub(pt2,pt1), V.sub(pt3,pt1))
  end

  ## 空間内の多角形の法線ベクトル (右ねじの向き)
  # 誤差対策で、三角形分割して各法線の和を返す
  def self.normal2(*poly)
    nor = [0,0,0]
    poly[1..-1].each_cons(2) {|v1, v2| 
      nor = V.add(nor, V.normal(poly[0], v1, v2)) }
    nor
  end

  ## [平面の方程式]
  ## 空間内の3点で定まる平面 ax + by + cz + d = 0 の [a,b,c,d] を返す
  def self.plane_eq(pt1, pt2, pt3)
    a, b, c = V.normal(pt1, pt2, pt3)
    d = - V.inn([a,b,c], pt1)
    [a, b, c, d]
  end

  ## 空間内の多角形の平面の方程式 (法線ベクトルは右ねじの向き)
  # ax + by + cz + d = 0 の [a,b,c,d] を返す
  def self.plane_eq2(*poly)
    a, b, c = V.normal2(*poly)
    d = - V.inn([a,b,c], poly[0])
    [a, b, c, d]
  end

  ## 空間内の平面の方程式の点の座標を代入
  def self.plane_pt(plane, pt)
    V.inn(plane, pt) + plane.last # 行儀悪いが内積が短い方に合わせるので
  end

  ## 空間内の3平面の交点
  def self.int_plane_plane_plane(plane1, plane2, plane3)
    a1, b1, c1, d1 = plane1
    a2, b2, c2, d2 = plane2
    a3, b3, c3, d3 = plane3
    det = V.det( [a1, b1, c1],
                 [a2, b2, c2],
                 [a3, b3, c3]).to_f
    raise 'det is zero' if det.zero?
    xdet = V.det( [-d1, b1, c1],
                  [-d2, b2, c2],
                  [-d3, b3, c3])
    ydet = V.det( [a1, -d1, c1],
                  [a2, -d2, c2],
                  [a3, -d3, c3])
    zdet = V.det( [a1, b1, -d1],
                  [a2, b2, -d2],
                  [a3, b3, -d3])
    [ xdet/det, ydet/det, zdet/det ]
  end

  ## 空間内の平面 ax+by+cz+d=0 と、2点pt0, pt1 を結ぶ直線の交点 pt0 + t (pt1-pt0) の t
  # 共有点なければ nil、含まれていたら true
  def self.int_plane_line_t(plane, pt0, pt1)
    abc = plane[0..2]
    d = plane[3]
    v = V.sub(pt1, pt0)
    deno = V.inn(abc, v)
    nume = -d - V.inn(abc, pt0)
    if deno.abs > EPS then
      nume / deno.to_f
    elsif nume == 0 then
      true
    else
      nil
    end
  end

  ## 空間内の平面 ax+by+cz+d=0 と、2点pt0, pt1 を結ぶ直線の交点
  # 共有点なければ nil、含まれていたら pt0
  def self.int_plane_line(plane, pt0, pt1)
    t = V.int_plane_line_t(plane, pt0, pt1)
    if t.kind_of? Numeric then
      V.add(pt0, V.scl(t, V.sub(pt1, pt0)))
    elsif ! t then # 共有点なし
      t
    else # 含まれている
      pt0
    end
  end

  ## 空間内の直線pt0-pt1が平面planeの正の側にある t の範囲
  # 区間集合で返す。
  # 直線が平面に含まれるなら [-INF, INF]
  # 直線が平面と平行ならば、正の側かどうかに応じて  [-INF, INF] か []
  def self.pospart_plane_line_t(plane, pt0, pt1)
    t = V.int_plane_line_t(plane, pt0, pt1)
    p_pt0 = V.plane_pt(plane, pt0)
    p_pt1 = V.plane_pt(plane, pt1)
    if t == true then # 直線が平面に含まれるとき
      [[-INF, INF]]
    elsif ! t then # 直線が平面と平行のとき
      p_pt0 >= 0 ? [[-INF, INF]] : []
    elsif p_pt0.abs <= EPS && p_pt1.abs <= EPS then # 保険
      [[-INF, INF]]
    else # 交わるとき
      p_pt0 > p_pt1 ? [[-INF, t]] : [[t, INF]]
    end
  end

  ## 空間内の平面と多角形の交線 (辺は除外)
  # 空間内の2つの多角形の交線。線分の配列で返す。多角形の辺は含めない
  def self.int_poly_poly(poly1, poly2)
    plane1, plane2 = V.plane_eq2(*poly1), plane_eq2(*poly2)
    nor1, nor2 = plane1[0..2], plane2[0..2]
    v = V.ext(nor1, nor2) # 交線の方向ベクトル
    len2 = V.inn(v, v)
    return [] if len2 < EPS # 面がほぼ平行なら交線なし
    v = V.scl(len2**(-0.5), v) # 交線の単位方向ベクトル
    #
    ivls1 = V.int_plane_poly_t(plane1, poly2, v) # 平面と多角形の交線のパラメータ
    ivls2 = V.int_plane_poly_t(plane2, poly1, v) # 平面と多角形の交線のパラメータ
    ivls = Ivl.intersection(ivls1, ivls2)
    #
    pt = V.int_plane_plane_plane(plane1, plane2, v+[0]) # 交線の基点
    ivls.map {|a,b|
      [V.add(pt, V.scl(a, v)), V.add(pt, V.scl(b, v))].sort # 同じ線分の識別のためsort
    }
  end

  ## 空間内の平面と多角形の交線の、パラメータによる区間集合
  # パラメータ付けは方向ベクトル v との内積 
 def self.int_plane_poly_t(plane, poly, v)
    n_plane = plane[0..2]
    n_poly = V.normal2(*poly)
    ds = poly.map {|pt| V.plane_pt(plane, pt) }
    ts = [] # [パラメータ, 前の頂点をplaneに代入した値]の配列
    # 多角形の各辺について平面と交わっていたら交点やパラメータを収集
    poly.size.times {|i|
      j = (i+1) % poly.size
      next if ds[i]*ds[j] > 0 # planeの同じ側にいるので交点はない
      s = V.int_plane_line_t(plane, poly[i], poly[j])
      s = 0 if s == true # 直線が平面に含まれていたらtrueが返る
      next if ! s || s < 0-EPS || s > 1+EPS || ds[i].zero? # ds[i]=0を無視できる設計
      pt = V.add(poly[i], V.scl(s, V.sub(poly[j], poly[i])))
      ts.push [V.inn(pt, v), ds[i]]
    }
    # 交点がないなら交線もない
    return [] if ts.empty?
    # 最初のtが正になるよう、必要であれば符号を反転
    ts = ts.sort
    ts = ts.map {|s, t| [s, -t] } if ts[0][1] < 0
    #
    ivls = []
    # 各交点に対して
    ts.each {|s, t|
      if t > 0 then # t > 0 なら区間開始 (開始済みなら前回の開始を上書き)
        ivls.pop if ! ivls.empty? && ivls[-1].size==1
        ivls.push [s]
      elsif t < 0 then # t < 0 なら区間終了 (未開始なら今回のを無視)
        ivls[-1].push(s) if ! ivls.empty? && ivls[-1].size == 1
      end
    }
    # 最後の区間が閉じていなければ削除
    ivls.pop if ! ivls.empty? && ivls[-1].size == 1
    ivls
  end

  ## [空間内の点の移動、回転]
  ## x軸回りに点たちを回転
  def self.rotate_x(rad, *pts)
    c, s = Math.cos(rad), Math.sin(rad)
    pts.map {|x,y,z| [x, c*y-s*z, s*y+c*z] }
  end

  ## y軸回りに点たちを回転
  def self.rotate_y(rad, *pts)
    c, s = Math.cos(rad), Math.sin(rad)
    pts.map {|x,y,z| [c*x-s*z, y, s*x+c*z] }
  end

  ## z軸回りに点たちを回転
  def self.rotate_z(rad, *pts)
    c, s = Math.cos(rad), Math.sin(rad)
    pts.map {|x,y,z| [c*x-s*y, s*x+c*y, z] }
  end

  ## [平面内の線分、直線、多角形]
  ## 平面内の多角形の符号付き面積の倍 (外積で求める)
  def self.area2(*poly)
    z = 0
    x0, y0 = poly[0]
    poly[1..-1].each_cons(2) {|(x1,y1), (x2,y2)|
      z += (x1-x0)*(y2-y0) - (y1-y0)*(x2-x0)
    }
    z
  end

  ## 平面内の2直線の交点のパラメータ
  # u0 + s (u1-u0) = v0 + t (v1-u0) を満たすパラメータ s,t を返す)
  # 交点がなければ [nil, nil]
  def self.int_line_line_st(u0, u1, v0, v1)
    d = V.area2([0,0], V.sub(u1, u0), V.sub(v1, v0))
    return [nil,nil] if d == 0
    s = -V.area2(v0, u0, v1) / d.to_f
    t = -V.area2(v0, u0, u1) / d.to_f
    [s,t]
  end

  ## 平面内の2直線の交点
  # 交点がなければnil
  def self.int_line_line(u0, u1, v0, v1)
    s, t = V.int_line_line_st(u0, u1, v0, v1)
    if s.kind_of? Numeric then
      V.add(u0, V.scl(s, V.sub(u1, u0)))
    else
      nil
    end
  end

  ## 平面内の線分と多角形を与えると、線分の多角形外部の部分を t の区間集合として返す
  # 多角形は、頂点を巡ったとき左手側が内部  (外積のz座標が正) になるようにしておく
  IN, OUT = 1, 0
  def self.outside_line_t(pt0, pt1, poly)
    pt0pt1 = V.sub(pt1, pt0)
    p90 = [pt0pt1[1], -pt0pt1[0]] # これと辺のベクトルの内積が正 (鋭角) なら、内部に入る
    ts = []
    out_ivls = []
    [poly[-1], *poly].each_cons(2) {|v0, v1|
      s, t = V.int_line_line_st(v0, v1, pt0, pt1)
      if ! s && V.area2(v0, v1, pt0).abs < EPS then # 線分が辺と同一直線なら外部
        t0 = V.inn(pt0pt1, V.sub(v0,pt0)) / V.inn(pt0pt1, pt0pt1).to_f
        t1 = V.inn(pt0pt1, V.sub(v1,pt0)) / V.inn(pt0pt1, pt0pt1).to_f
        out_ivls.push [t0,t1].sort
        next
      end
      next if ! s || s < 0-EPS || s > 1+EPS
      inout = V.inn(p90, V.sub(v1, v0)) > 0 ? IN : OUT
      ts.push [t, inout]
    }
    ts = (ts + [[INF, IN]]).sort
    ts2 = [[-INF, OUT]]
    while ! ts.empty?
      if ts2[-1][1] == ts[0][1] then
        ts.shift
      else
        ts2.push(ts.shift)
      end
    end
    if ts2[-1][1] == OUT then
      ts2.push [INF, IN]
    elsif ts2[-1][0] != INF then
      ts2[-1][0] = INF
    end
    ts3 = ts2.map {|t,inout| t}.each_slice(2).to_a
    Ivl.union(*(ts3+out_ivls))
  end
end # of module V

#### 陰線処理
module HLR
  ## 視点x座標、スクリーンx座標、点たちを与えると、射影した2次元の点たちを返す
  # eyex 視点の位置 (eye, 0, 0) から (0,0,0) を見る
  # scrnx スクリーンの位置。x = scrnx
  def self.proj(eyex, scrnx, *pts)
    raise unless scrnx > 0 && eyex > scrnx
    pts.map {|x,y,z|
      r = (eyex-scrnx)/(eyex-x).to_f
      [y*r, z*r]
    }
  end

  ## 陰線処理して射影した後の描画すべき線分たちを返す。
  # 引数   eyex   視点の位置 (eye, 0, 0) から (0,0,0) を見る
  #        scrnx  スクリーンの位置。x = scrnx
  #        gap    線分どうしが重なったときに欠く幅。単位は3次元座標での距離1。
  #               欠かないならnil
  #        segs3d 空間の線分たち
  #        poly3d 空間の多角形たち。辺は描画されないのでsegs3dに入れること。
  #        s_on_p 線分=>{含まれる平面の番号} のHash。
  # 返り値 segs2d    見える線分たち。切り欠き済み
  #        invsegs2d 見えない線分たち。
  def self.visible_segs(eyex, scrnx, gap, segs3d, polys3d, s_on_p)
    # 視点
    pteye = [eyex, 0, 0]
    # 多角形を射影。頂点を巡ったとき左手側が内部  (外積のz座標が正) にする
    polys2d = polys3d.map {|pts| 
      poly = HLR.proj(eyex, scrnx, *pts) 
      (V.area2(*poly) >= 0) ? poly : poly.reverse
    }
    # 多角形の平面の方程式。視点が正の側にする
    planes3d = polys3d.map {|pts| 
      plane = V.plane_eq(*pts[0..2]) # 最初の3点で平面を決定
      (V.plane_pt(plane, pteye) >= 0) ? plane : plane.map {|a| -a } # 視点を正の側に
    }
    # 線分を射影
    segs2d = segs3d.map {|pts| HLR.proj(eyex, scrnx, *pts) }
    # 返り値
    vsegs2d = [] # 見える線分 (切り欠き済み)
    invsegs2d = [] # 見えない線分
    # 各3D線分に対して
    segs3d.size.times {|i|
      p0, p1 = segs3d[i]
      q0, q1 = segs2d[i]
      ivls = [[0,1]]
      # 各面で隠れない部分を求める
      polys3d.size.times {|k|
        next if s_on_p[segs3d[i]][k] # 線分を含む平面は無視
        next if polys3d[k].include?(p0) && polys3d[k].include?(p1) # 線分が面上なら無視 (遅くなるが)
        pos_ivls = V.pospart_plane_line_t(planes3d[k], p0, p1) # 面の手前側の区間 (3d)
        pos_ivls_3d = Ivl.to_2d(pos_ivls, p0, p1, eyex)
        vis_ivls = (q0==q1) ? [] : V.outside_line_t(q0, q1, polys2d[k]) # 面の外部の区間 (2d)
        ivls = Ivl.intersection(ivls, Ivl.union(*(pos_ivls_3d + vis_ivls))) # それらの共通部分
      }
      # 隠れている線を求める
      inv_ivls = Ivl.sub([[0,1]], ivls)
      invsegs2d += inv_ivls.map {|ts|
        ts.map {|t| V.add(q0, V.scl(t, V.sub(q1,q0))) }.sort } # 同じ線分の識別のためsort
      # 切り欠き
      if gap && ! ivls.empty? then
        gap_w = gap / Math.sqrt(V.inn(V.sub(p0, p1), V.sub(p0, p1))) / 2
        ts = [] # 切り欠きを入れる場所
        segs3d.size.times {|k|
          u0, u1 = segs3d[k]
          v0, v1 = segs2d[k]
          s, t = V.int_line_line_st(v0, v1, q0, q1) # 2d
          next if ! s || s < 0 || s > 1 || t < 0 || t > 1
          s3d = Ivl.to_3d_t(s, u0, u1, eyex)
          t3d = Ivl.to_3d_t(t, p0, p1, eyex)
          next if u0[0]+s3d*(u1[0]-u0[0]) <= p0[0]+t3d*(p1[0]-p0[0] + EPS) # 奥行チェック
          ts.push t
        }
        ivls = Ivl.insert_gaps(ivls, ts, gap_w)
      end
      # 拡張された線分にして蓄積
      vsegs2d += ivls.map {|ts|
        ts.map {|t| V.add(q0, V.scl(t, V.sub(q1,q0))) }.sort 
      } # 同じ線分の識別のためsort
    }
    [vsegs2d.uniq, invsegs2d.uniq]
  end

end # of module HLR

#### 出力
module Output 
  ## 面で陰線処理して、線分をpicture環境で出力。curve2e必要
  # 面の辺は出力しないので、segs3dに追加しておくこと
  # 引数   eyex   視点の位置 (eye, 0, 0) から (0,0,0) を見る
  #        scrnx  スクリーンの位置。x = scrnx
  #        gap    線分どうしが重なったときに欠く幅。単位は3次元座標での距離1。
  #               欠かないならnil
  #        hidden 陰線を破線で出力するなら真の値
  #        segs3d 空間の線分たち
  #        poly3d 空間の多角形たち。辺は描画されないのでsegs3dに入れること。
  def self.tex(eyex, scrnx, gap, hidden, segs3d, polys3d, s_on_p)
    # 陰線処理
    segs2d, i_segs2d = HLR.visible_segs(eyex, scrnx, gap, segs3d, polys3d, s_on_p)
    # 射影後の2次元座標の範囲
    (xmin, xmax), (ymin, ymax) =
                  segs2d.flatten.each_slice(2).to_a.transpose.map {|xs| xs.minmax }
    # picture環境出力
    twopts = "(%.#{DIGITS}f,%.#{DIGITS}f)" * 2
    puts "\\begin{picture}#{twopts}" % [xmax-xmin,ymax-ymin,xmin,ymin]
    # 見える線
    segs2d.each {|(x0,y0), (x1,y1)| puts "\\Line#{twopts}" % [x0, y0, x1, y1] }
    # 見えない線
    if hidden then
      i_segs2d.each {|(x0,y0), (x1,y1)| 
        if x0.round(DIGITS)!=x1.round(DIGITS) ||
           y0.round(DIGITS)!=y1.round(DIGITS)  then
          puts "\\Dline#{twopts}{%s}" % [x0, y0, x1, y1, 0.02]
        end
      }
    end
    puts '\\end{picture}'
  end

  ## 面で陰線処理して、線分をpicture環境で出力。curve2e必要
  # Output.texとの違いは2点
  # (1) 面の辺も出力すること。segs3dに追加する必要はない。
  # (2) int_p_pが真のとき面に含まれる線分 (辺と交線) の情報 s_on_p を作成する。
  def self.texPolyhedron(eyex, scrnx, gap, hidden, segs3d, polys, int_p_p)
    n = polys.size
    s_on_p = Hash.new {|h, k| h[k] = {} }
    # 多角形の辺を登録
    edges3d = n.times.flat_map {|i|
      [polys[i][-1], *polys[i]].each_cons(2).map {|p0p1|
        p0p1 = p0p1.sort # 同じ線分の識別のためsort
        s_on_p[p0p1][i] = true # 含まれている平面を登録
        p0p1
      }}.uniq
    # 多角形どうしの交線を登録
    int3d = []
    if int_p_p then 
      n.times {|i|
        (i+1...n).each {|j|
          segs = V.int_poly_poly(polys[i], polys[j])
          int3d += segs
          segs.each {|p0p1|
            p0p1 = p0p1.sort # 同じ線分の識別のためsort
            s_on_p[p0p1][i] = true # 含まれている平面を登録
            s_on_p[p0p1][j] = true # 含まれている平面を登録
          }}}
    end
    # tex出力
    Output.tex(eyex, scrnx, gap, hidden, segs3d + edges3d + int3d, polys, s_on_p)
  end
end # of module Output

#### main
if $0 == __FILE__ then

eyex = 50
scrnx = 30
gap = 0.2
polys3d = [
  [[0,0,0],[0,2,0],[2,2,0],[2,0,0]],
  [[1,0,-1],[1,2,-1],[1,2,1],[1,0,1]]
]
segs3d = [
[[-1,-1,1],[100,-1,1]]
]
segs3d += V.int_poly_poly(polys3d[0], polys3d[1])

s_on_p = {}
segs3d.each {|seg| s_on_p[seg] = {} }
p(HLR.visible_segs(eyex, scrnx, gap, segs3d, polys3d, s_on_p));


exit


  # ヘッダ
  puts <<EOS
\\documentclass[a5j,landscape]{jarticle}
\\usepackage[dvipdfmx]{curve2e}
\\usepackage{multicol}
\\begin{document}%あ
\\unitlength=55mm
EOS

  #  _   _
  # | |_| |
  # |____/
  polys = [
    [[0,0,0],[0,2,0],[0,3,1],[0,3,2],[0,2,2],[0,2,1],[0,1,1],[0,1,2],[0,0,2]],
    [[2,0,0],[2,2,0],[2,3,1],[2,3,2],[2,2,2],[2,2,1],[2,1,1],[2,1,2],[2,0,2]],
    [[0,0,0],[0,2,0],[2,2,0],[2,0,0]],
    [[0,2,0],[0,3,1],[2,3,1],[2,2,0]],
    [[0,3,1],[0,3,2],[2,3,2],[2,3,1]],
    [[0,3,2],[0,2,2],[2,2,2],[2,3,2]],
    [[0,2,2],[0,2,1],[2,2,1],[2,2,2]],
    [[0,2,1],[0,1,1],[2,1,1],[2,2,1]],
    [[0,1,1],[0,1,2],[2,1,2],[2,1,1]],
    [[0,1,2],[0,0,2],[2,0,2],[2,1,2]],
    [[0,0,2],[0,0,0],[2,0,0],[2,0,2]],
  ]
  #

  polys = [
    [
      [0,0,0],
      [0,2,0],
      [2,2,0],
      [2,0,0]
    ],
     [
       [1,0,-1],
       [1,2,-1],
       [1,2,1],
       [1,0,1],
     ]
  ]

  segs = [
    [[0,0,0],[2,2,0]],
    [[0,2,0],[2,0,0]],
    [[0.1,0.1,-1],[0.1,0.1,1]]
  ]

0.step(80,1) {|i|
    eye = 20
    scrnx = 10
    rotz = i*4*DEG
    roty = i*DEG
    polys_r = polys.map {|pts| V.rotate_y(roty, *pts) }
    polys_r = polys_r.map {|pts| V.rotate_z(rotz, *pts) }

    segs_r = segs.map {|pts| V.rotate_y(roty, *pts) }
    segs_r = segs_r.map {|pts| V.rotate_z(rotz, *pts) }

    puts '\\newpage\\relax{'
    Output.texPolyhedron(eye, scrnx, 0.1, false, segs_r, polys_r, true)
    puts "}\\bigskip\\par"
  }
  puts '\\end{document}'
end
