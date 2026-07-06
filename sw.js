請修復 fresh2.html 的一個雲端同步 bug：登入後的雲端還原只下載作業資料（day:），沒有下載輔導紀錄（counsel:），導致重裝或換裝置後單日輔導紀錄消失。資料仍在 Firestore，只需補上下載邏輯。

【修改前必做】
1. cp fresh2.html fresh2.html.bak
2. grep -n "fsGetAll(firebaseUid, _pfx+'day:')" fresh2.html 定位（約 4484 行，登入後雲端還原 useEffect 內，注意不要選到約 3235 行那個 _arcPfx 的）
3. 只用 view_range 讀該處 ±30 行，禁止讀整個檔案（1.3MB 會爆 token）

【要找的目標程式碼】

                var _pfx = classPrefix();
                var allData = await window.fsGetAll(firebaseUid, _pfx+'day:');
                var c = 0;
                for (var k in allData) {
                    if (k.startsWith(_pfx+'day:')) {
                        var ds = k.replace(_pfx+'day:', '');
                        await idbSet(_pfx+'day:' + ds, allData[k]);
                        try { _sl.set('hw5ren:' + _pfx + ds, allData[k]); } catch(ex) {}
                        c++;
                    }
                }

【修改方式】用 str_replace 在上面那段結尾的 } 之後插入：

                // ── 輔導紀錄：從 Firebase 還原（修復：先前只還原 day: 導致重裝後輔導紀錄消失）──
                var cCounsel = 0;
                try {
                    var counselData = await window.fsGetAll(firebaseUid, _pfx+'counsel:');
                    for (var ck in counselData) {
                        if (ck.startsWith(_pfx+'counsel:')) {
                            var cds = ck.replace(_pfx+'counsel:', '');
                            await idbSet(_pfx+'counsel:' + cds, counselData[ck]);
                            try { _sl.set('hw5ren:c:' + _pfx + cds, counselData[ck]); } catch(ex) {}
                            cCounsel++;
                        }
                    }
                } catch(exC) {}

【接著】找到同一個 useEffect 稍後的還原完成訊息：
setStor({ state: 'ok', msg: '✅ 雲端還原 ' + c + ' 天資料' });
改為：
setStor({ state: 'ok', msg: '✅ 雲端還原 ' + c + ' 天資料、' + cCounsel + ' 天輔導' });
並把該行的條件 if (c > 0) 改為 if (c > 0 || cCounsel > 0)

【重要規則】
- counselData 的值原樣寫入，不要 JSON.parse 再 stringify
- localStorage 備援 key 必須是 'hw5ren:c:' + pfx + 日期（對應 loadCounsel 讀取格式）
- 不要動 doSync、scheduleAutoSync、loadCounsel、saveCounsel、sw.js

【修改後必做驗證】
1. wc -c fresh2.html 確認 > 0
2. grep -n "cCounsel" fresh2.html 確認至少出現 4 次
3. 靜態分析必須兩項都是 0：
python3 -c "
t=open('fresh2.html').read()
print('() diff:', t.count('(')-t.count(')'))
print('{} diff:', t.count('{')-t.count('}'))
"
4. 完成後以「✅ 靜態分析通過，直接上傳 GitHub 即可，不需要再跑一次」結尾。
