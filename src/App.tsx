import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, update, set } from "firebase/database";
import { Trophy, Mic, Crown, Save, BarChart3, Settings, ChevronRight, ChevronLeft, Eye, EyeOff, AlertCircle, PlayCircle, CheckCircle2, UserCheck, LogOut } from 'lucide-react';

// ------------------------------------------------------------------
// 【重要】ここをあなたのFirebase設定に書き換えてください
// ------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCvMn1srEPkKRujzDZDfpmRFJmLxwX65NE",
  authDomain: "m1-app-1e177.firebaseapp.com",
  projectId: "m1-app-1e177",
  storageBucket: "m1-app-1e177.firebasestorage.app",
  messagingSenderId: "765518236984",
  appId: "1:765518236984:web:ee6fffae3d38729a1605cd"
};

// Firebase初期化チェック
const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY_HERE";
const app = isConfigured ? initializeApp(firebaseConfig) : null;
const db = app ? getDatabase(app) : null;
const DB_ROOT = 'm1_2025_v1';

// コンビ名リスト
const INITIAL_COMEDIANS = [
  { id: 1, name: "エバース" },
  { id: 2, name: "豪快キャプテン" },
  { id: 3, name: "真空ジェシカ" },
  { id: 4, name: "たくろう" },
  { id: 5, name: "ドンデコルテ" },
  { id: 6, name: "ママタルト" },
  { id: 7, name: "めぞん" },
  { id: 8, name: "ヤーレンズ" },
  { id: 9, name: "ヨネダ2000" },
  { id: 10, name: "敗者復活組" } 
];

export default function App() {
  const [user, setUser] = useState(null);
  const [loginName, setLoginName] = useState("");
  const [isAdminLogin, setIsAdminLogin] = useState(false);

  const [gameState, setGameState] = useState({
    phase: 'PREDICTION', 
    currentComedianIndex: 0,
    isScoreRevealed: false,
    comedians: INITIAL_COMEDIANS,
  });

  const [myPrediction, setMyPrediction] = useState({ first: "", second: "", third: "" });
  const [allPredictions, setAllPredictions] = useState({}); // 全員の予想データ
  const [scores, setScores] = useState({});
  const [myCurrentScore, setMyCurrentScore] = useState(85);
  const [isScoreSubmitted, setIsScoreSubmitted] = useState(false);
  const [editingComedianName, setEditingComedianName] = useState("");
  const [isPredictionSubmitted, setIsPredictionSubmitted] = useState(false); // 自分の予想送信済みフラグ

  // ローカルストレージからログイン情報を復元（リロード対策）
  useEffect(() => {
    const savedUser = localStorage.getItem('m1_user_v2');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Login restore failed", e);
      }
    }
  }, []);

  // Firebase同期
  useEffect(() => {
    if (!db) return;
    
    // ゲーム状態
    const unsubGame = onValue(ref(db, `${DB_ROOT}/gameState`), (snap) => {
      const data = snap.val();
      if (data) setGameState(data);
    });
    
    // 採点データ
    const unsubScores = onValue(ref(db, `${DB_ROOT}/scores`), (snap) => {
      setScores(snap.val() || {});
    });

    // 予想データ (追加)
    const unsubPredictions = onValue(ref(db, `${DB_ROOT}/predictions`), (snap) => {
      const data = snap.val() || {};
      setAllPredictions(data);
    });

    return () => { unsubGame(); unsubScores(); unsubPredictions(); };
  }, []);

  // ログイン時に過去の自分の予想があれば復元
  useEffect(() => {
    if (user && allPredictions[user.name]) {
      setMyPrediction(allPredictions[user.name]);
      setIsPredictionSubmitted(true);
    }
  }, [user, allPredictions]);

  // コンビ変更時に採点状態リセット
  useEffect(() => {
    setMyCurrentScore(85);
    setIsScoreSubmitted(false);
  }, [gameState.currentComedianIndex]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!loginName) return;
    const userData = { name: loginName, isAdmin: isAdminLogin };
    setUser(userData);
    // ログイン情報をブラウザに保存
    localStorage.setItem('m1_user_v2', JSON.stringify(userData));
  };

  const handleLogout = () => {
    if(window.confirm("ログアウトしますか？")) {
      localStorage.removeItem('m1_user_v2');
      setUser(null);
      setLoginName("");
    }
  };

  // 予想を送信 (追加)
  const submitPrediction = () => {
    if (!db || !user) return;
    if (!myPrediction.first || !myPrediction.second || !myPrediction.third) {
      alert("1位〜3位まですべて選択してください");
      return;
    }
    // predictions/ユーザー名 に保存
    update(ref(db, `${DB_ROOT}/predictions/${user.name}`), {
      ...myPrediction,
      name: user.name
    });
    setIsPredictionSubmitted(true);
    alert("予想を保存しました！");
  };

  const submitScore = () => {
    if (!db || !user) return;
    const comedianId = gameState.comedians[gameState.currentComedianIndex].id;
    update(ref(db, `${DB_ROOT}/scores/${comedianId}`), { [user.name]: myCurrentScore });
    setIsScoreSubmitted(true);
  };

  const adminUpdate = (updates) => {
    if (!db) return;
    update(ref(db, `${DB_ROOT}/gameState`), updates);
  };

  const adminInit = () => {
    if (!db) return;
    if(!window.confirm("本当にデータを全て初期化しますか？")) return;
    
    set(ref(db, `${DB_ROOT}/gameState`), {
      phase: 'PREDICTION',
      currentComedianIndex: 0,
      isScoreRevealed: false,
      comedians: INITIAL_COMEDIANS
    });
    set(ref(db, `${DB_ROOT}/scores`), {});
    set(ref(db, `${DB_ROOT}/predictions`), {}); // 予想もクリア
    alert("リセットしました");
  };

  const currentRanking = useMemo(() => {
    return gameState.comedians.map(c => {
      const cScores = scores[c.id] || {};
      const values = Object.values(cScores);
      const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : 0;
      return { ...c, avg: parseFloat(avg) };
    }).sort((a, b) => b.avg - a.avg);
  }, [scores, gameState.comedians]);

  // --- UI RENDER ---

  if (!isConfigured) {
    return (
      <div style={{padding: "2rem", textAlign: "center", color: "#ef4444"}}>
        <AlertCircle size={48} style={{margin: "0 auto 1rem"}}/>
        <h2>Firebaseの設定が必要です</h2>
        <p>App.tsxのコード内の <code>firebaseConfig</code> をあなたのキーに書き換えてください。</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container" style={{textAlign: "center", marginTop: "4rem"}}>
        <Trophy size={64} color="#eab308" style={{margin: "0 auto 1rem"}}/>
        <h1 style={{fontSize: "2rem", fontWeight: "bold", marginBottom: "2rem", color: "#eab308"}}>M-1 SCORING 2025</h1>
        <form onSubmit={handleLogin} style={{display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "300px", margin: "0 auto"}}>
          <input type="text" placeholder="ニックネーム" value={loginName} onChange={(e) => setLoginName(e.target.value)}
            style={{padding: "1rem", borderRadius: "8px", border: "1px solid #475569", background: "#1e293b", color: "white"}} />
          <label style={{display: "flex", alignItems: "center", gap: "0.5rem", color: "#94a3b8", fontSize: "0.9rem"}}>
            <input type="checkbox" checked={isAdminLogin} onChange={(e) => setIsAdminLogin(e.target.checked)}/> 管理者モード
          </label>
          <button type="submit" style={{padding: "1rem", borderRadius: "8px", background: "#dc2626", color: "white", fontWeight: "bold", border: "none", cursor: "pointer"}}>エントリー</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{paddingBottom: "140px"}}>
      {/* ヘッダー */}
      <header style={{background: "#1e293b", padding: "1rem", position: "sticky", top: 0, zIndex: 10, borderBottom: "1px solid #334155"}}>
        <div className="container" style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: 0}}>
          <div style={{fontWeight: "bold", display: "flex", alignItems: "center", gap: "0.5rem"}}>
            <span style={{background: "#eab308", color: "black", padding: "2px 6px", borderRadius: "4px", fontSize: "0.8rem"}}>M-1</span> SCORING
          </div>
          <div style={{fontSize: "0.9rem", color: "#cbd5e1", display: "flex", alignItems: "center", gap: "10px"}}>
            <span>{user.name} {user.isAdmin && "★"}</span>
            <button onClick={handleLogout} style={{background: "transparent", border: "none", color: "#64748b", cursor: "pointer", padding: "4px"}}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* ステータスバー */}
      <div style={{
        textAlign: 'center', padding: '0.5rem', fontWeight: 'bold', fontSize: '0.9rem',
        background: gameState.phase === 'PREDICTION' ? '#2563eb' : (gameState.phase === 'SCORING' ? '#b91c1c' : '#059669'),
        color: 'white', borderBottom: '1px solid rgba(255,255,255,0.1)', transition: 'background 0.3s'
      }}>
        {gameState.phase === 'PREDICTION' && "🏆 3連単予想 受付中"}
        {gameState.phase === 'SCORING' && `🎤 採点進行中 (No.${gameState.currentComedianIndex + 1})`}
        {gameState.phase === 'FINISHED' && "✨ 大会終了"}
      </div>

      <main className="container">
        
        {/* フェーズ1: 予想 */}
        {gameState.phase === 'PREDICTION' && (
          <div style={{textAlign: "center", padding: "2rem 0"}}>
            <Crown size={48} color="#eab308" style={{margin: "0 auto 1rem"}}/>
            <h2 style={{fontSize: "1.5rem", marginBottom: "0.5rem"}}>3連単予想</h2>
            <p style={{color: "#94a3b8", fontSize: "0.9rem", marginBottom: "2rem"}}>今年のTop3を予想して保存しよう</p>
            
            <div style={{display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "400px", margin: "0 auto"}}>
              {['優勝', '2位', '3位'].map((rank, i) => (
                <div key={rank} style={{display: "flex", alignItems: "center", gap: "1rem"}}>
                  <span style={{width: "40px", fontWeight: "bold", color: i===0?"#eab308":i===1?"#cbd5e1":"#b45309"}}>{rank}</span>
                  <select 
                    style={{flex: 1, padding: "0.8rem", borderRadius: "6px", background: "#1e293b", color: "white", border: "1px solid #475569"}}
                    value={i===0?myPrediction.first:i===1?myPrediction.second:myPrediction.third}
                    onChange={(e) => {
                      setMyPrediction({...myPrediction, [i===0?'first':i===1?'second':'third']: e.target.value});
                      setIsPredictionSubmitted(false); // 変更したら未送信状態に
                    }}
                  >
                    <option value="">選択...</option>
                    {gameState.comedians.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ))}
              
              <button 
                onClick={submitPrediction}
                disabled={isPredictionSubmitted}
                style={{
                  marginTop: "1rem", padding: "1rem", borderRadius: "8px", border: "none", cursor: "pointer",
                  background: isPredictionSubmitted ? "#059669" : "#eab308", 
                  color: isPredictionSubmitted ? "white" : "black",
                  fontWeight: "bold", fontSize: "1.1rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px"
                }}
              >
                {isPredictionSubmitted ? <><CheckCircle2 size={20}/> 予想を保存しました</> : <><Save size={20}/> 予想を保存する</>}
              </button>
            </div>
            
            {/* 予想提出状況リスト */}
            <div style={{marginTop: "3rem", padding: "1.5rem", background: "#1e293b", borderRadius: "8px", textAlign: "left"}}>
              <p style={{fontSize: "0.9rem", color: "#94a3b8", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "6px"}}>
                <UserCheck size={16}/> 予想済みのメンバー ({Object.keys(allPredictions).length}人)
              </p>
              <div style={{display: "flex", flexWrap: "wrap", gap: "8px"}}>
                {Object.keys(allPredictions).length === 0 && <span style={{fontSize: "0.8rem", color: "#64748b"}}>まだ誰も提出していません</span>}
                {Object.keys(allPredictions).map(name => (
                  <span key={name} style={{background: "#334155", padding: "4px 10px", borderRadius: "20px", fontSize: "0.85rem", color: "white"}}>
                    {name}
                  </span>
                ))}
              </div>
            </div>

            {user.isAdmin && (
              <div style={{marginTop: "2rem", borderTop: "1px solid #334155", paddingTop: "1rem"}}>
                <button onClick={adminInit} style={{background: "#334155", color: "#94a3b8", border: "none", padding: "0.5rem 1rem", borderRadius: "4px", fontSize: "0.8rem"}}>⚠️ DBリセット</button>
              </div>
            )}
          </div>
        )}

        {/* フェーズ2: 採点 & 結果 */}
        {(gameState.phase === 'SCORING' || gameState.phase === 'FINISHED') && (
          <div>
            {/* コンビ名カード */}
            <div style={{
              background: "linear-gradient(to bottom right, #7f1d1d, #0f172a)", 
              padding: "2rem", borderRadius: "16px", textAlign: "center", marginBottom: "2rem", border: "1px solid #991b1b",
              boxShadow: "0 10px 25px -5px rgba(220, 38, 38, 0.3)"
            }}>
              <div style={{color: "#fca5a5", fontSize: "0.8rem", letterSpacing: "2px", marginBottom: "0.5rem"}}>ENTRY NO.{gameState.currentComedianIndex + 1}</div>
              <h2 style={{fontSize: "2.5rem", fontWeight: "900", margin: "0 0 1rem 0", lineHeight: 1.2}}>
                {gameState.comedians[gameState.currentComedianIndex].name}
              </h2>
              {gameState.isScoreRevealed && (
                 <div style={{fontSize: "3rem", fontWeight: "bold", color: "#eab308", textShadow: "0 0 20px rgba(234, 179, 8, 0.5)"}}>
                   {currentRanking.find(c => c.id === gameState.comedians[gameState.currentComedianIndex].id)?.avg}
                   <span style={{fontSize: "1rem", marginLeft: "0.5rem", color: "white", textShadow: "none"}}>点</span>
                 </div>
              )}
            </div>

            {/* 採点入力エリア */}
            {!gameState.isScoreRevealed && gameState.phase !== 'FINISHED' && (
              <div style={{background: "#1e293b", padding: "2rem", borderRadius: "12px", border: "1px solid #334155"}}>
                {!isScoreSubmitted ? (
                  <>
                    <div style={{textAlign: "center", fontSize: "4rem", fontWeight: "bold", marginBottom: "1rem", fontFamily: "monospace"}}>{myCurrentScore}</div>
                    <input type="range" min="50" max="100" value={myCurrentScore} onChange={(e) => setMyCurrentScore(parseInt(e.target.value))}
                      style={{width: "100%", marginBottom: "2rem", accentColor: "#eab308", height: "10px", cursor: "pointer"}} />
                    <button onClick={submitScore} style={{width: "100%", padding: "1rem", background: "#eab308", color: "black", fontWeight: "bold", fontSize: "1.2rem", borderRadius: "8px", border: "none", display: "flex", justifyContent: "center", gap: "0.5rem", alignItems: "center", cursor: "pointer"}}>
                      <Save size={24}/> 採点を確定する
                    </button>
                  </>
                ) : (
                  <div style={{textAlign: "center", padding: "2rem"}}>
                    <CheckCircle2 size={48} color="#22c55e" style={{margin: "0 auto 1rem"}}/>
                    <h3 style={{fontSize: "1.5rem", marginBottom: "0.5rem"}}>採点完了！</h3>
                    <p style={{color: "#94a3b8"}}>結果発表を待っています...</p>
                    <button onClick={() => setIsScoreSubmitted(false)} style={{background: "none", border: "none", color: "#cbd5e1", textDecoration: "underline", marginTop: "1rem", cursor: "pointer"}}>修正する</button>
                  </div>
                )}
              </div>
            )}

            {/* 結果表示エリア */}
            {gameState.isScoreRevealed && (
              <div style={{display: "flex", flexDirection: "column", gap: "1rem"}}>
                <div style={{background: "#1e293b", borderRadius: "12px", padding: "1rem"}}>
                  <div style={{fontSize: "0.9rem", color: "#94a3b8", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem"}}><BarChart3 size={16}/> 審査員別スコア</div>
                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: "0.5rem"}}>
                    {Object.entries(scores[gameState.comedians[gameState.currentComedianIndex].id] || {}).map(([name, score]) => (
                      <div key={name} style={{background: "#334155", padding: "0.8rem", borderRadius: "6px", textAlign: "center", border: name===user.name?"1px solid #3b82f6":"none"}}>
                        <div style={{fontSize: "0.7rem", color: "#cbd5e1", marginBottom: "4px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{name}</div>
                        <div style={{fontSize: "1.2rem", fontWeight: "bold", color: score>=95?"#eab308":score>=90?"#f87171":"white"}}>{score}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{background: "#1e293b", borderRadius: "12px", padding: "1rem"}}>
                  <div style={{fontSize: "0.9rem", color: "#94a3b8", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem"}}><Trophy size={16}/> 現在のランキング</div>
                  {currentRanking.filter(c => c.avg > 0).map((c, i) => (
                    <div key={c.id} style={{display: "flex", justifyContent: "space-between", padding: "0.8rem 0", borderBottom: "1px solid #334155"}}>
                       <div style={{display: "flex", gap: "1rem", alignItems: "center"}}>
                         <span style={{width: "24px", height: "24px", background: i===0?"#eab308":i===1?"#94a3b8":i===2?"#b45309":"#334155", color: i<3?"black":"white", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "0.8rem"}}>{i+1}</span>
                         <span style={{fontWeight: "bold"}}>{c.name}</span>
                       </div>
                       <span style={{fontWeight: "bold", color: "#eab308", fontSize: "1.2rem"}}>{c.avg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 管理者パネル (デザイン改善) */}
      {user.isAdmin && (
        <div style={{position: "fixed", bottom: 0, left: 0, right: 0, background: "#0f172a", borderTop: "1px solid #334155", padding: "1rem", zIndex: 100}}>
          <div className="container" style={{padding: 0}}>
            <div style={{display: "flex", justifyContent: "space-between", marginBottom: "1rem", alignItems: "center"}}>
              <div style={{color: "#ef4444", fontSize: "0.8rem", fontWeight: "bold", display: "flex", alignItems: "center", gap: "4px"}}><Settings size={12}/> 管理者パネル</div>
              <div style={{display: "flex", gap: "0.5rem", background: "#1e293b", padding: "4px", borderRadius: "6px"}}>
                <button onClick={() => adminUpdate({phase: 'PREDICTION'})} 
                  style={{fontSize: "0.7rem", padding: "6px 12px", background: gameState.phase==='PREDICTION'?"#2563eb":"transparent", color: "white", border: "none", borderRadius: "4px", fontWeight: gameState.phase==='PREDICTION'?"bold":"normal", cursor: "pointer"}}>予想フェーズ</button>
                <button onClick={() => adminUpdate({phase: 'SCORING'})} 
                  style={{fontSize: "0.7rem", padding: "6px 12px", background: gameState.phase==='SCORING'?"#dc2626":"transparent", color: "white", border: "none", borderRadius: "4px", fontWeight: gameState.phase==='SCORING'?"bold":"normal", cursor: "pointer"}}>採点フェーズ</button>
              </div>
            </div>
            
            <div style={{display: "flex", gap: "0.5rem", alignItems: "center"}}>
               <button onClick={() => adminUpdate({currentComedianIndex: Math.max(0, gameState.currentComedianIndex - 1), isScoreRevealed: false})} style={{background: "#334155", border: "none", color: "white", padding: "0.8rem", borderRadius: "8px", cursor: "pointer"}}><ChevronLeft/></button>
               
               {gameState.phase === 'SCORING' ? (
                 <button onClick={() => adminUpdate({isScoreRevealed: !gameState.isScoreRevealed})} style={{flex: 1, background: gameState.isScoreRevealed?"#334155":"#dc2626", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", padding: "0.8rem", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px"}}>
                   {gameState.isScoreRevealed ? <><EyeOff size={18}/> CLOSE</> : <><Eye size={18}/> 結果オープン</>}
                 </button>
               ) : (
                 <div style={{flex: 1, textAlign: "center", color: "#64748b", fontSize: "0.8rem", background: "#1e293b", padding: "0.8rem", borderRadius: "8px"}}>ここは予想フェーズです</div>
               )}

               <button onClick={() => gameState.currentComedianIndex < 9 ? adminUpdate({currentComedianIndex: gameState.currentComedianIndex + 1, isScoreRevealed: false, phase: 'SCORING'}) : adminUpdate({phase: 'FINISHED'})} style={{background: "#334155", border: "none", color: "white", padding: "0.8rem", borderRadius: "8px", cursor: "pointer"}}><ChevronRight/></button>
            </div>

            {/* 敗者復活名編集 */}
            {gameState.comedians[gameState.currentComedianIndex].id === 10 && (
               <div style={{marginTop: "1rem", display: "flex", gap: "0.5rem"}}>
                 <input type="text" placeholder="敗者復活の名前" value={editingComedianName} onChange={e=>setEditingComedianName(e.target.value)} style={{flex: 1, padding: "0.5rem", borderRadius: "4px", border: "none", background: "#334155", color: "white"}}/>
                 <button onClick={() => {
                   const newComedians = [...gameState.comedians];
                   newComedians[gameState.currentComedianIndex].name = editingComedianName;
                   adminUpdate({comedians: newComedians});
                   setEditingComedianName("");
                 }} style={{background: "#2563eb", color: "white", border: "none", padding: "0.5rem", borderRadius: "4px", fontSize: "0.8rem", cursor: "pointer"}}>更新</button>
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
