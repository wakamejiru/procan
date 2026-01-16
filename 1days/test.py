import streamlit as st
import pandas as pd
from datetime import date, datetime, timedelta

# --- ページ設定 ---
st.set_page_config(page_title="テストスケジュール提案アプリ", layout="wide")
st.title("🎓 テストスケジュール提案アプリ")
st.caption("目標：弱点を補いあえるようなプロジェクト管理をする")

# --- セッション状態の初期化 ---
if 'schedule' not in st.session_state:
    st.session_state.schedule = None
if 'history' not in st.session_state:
    st.session_state.history = {}

# --- サイドバー：設定入力 ---
with st.sidebar:
    st.header("⚙️ 基本設定")
    test_date = st.date_input("テストの日程", date.today() + timedelta(days=14))
    subjects = st.text_input("科目をカンマ区切りで入力", "数学, 英語, 物理")
    subject_list = [s.strip() for s in subjects.split(",")]
    
    st.divider()
    st.subheader("学習可能時間")
    weekday_hours = st.number_input("平日の勉強時間 (時)", min_value=0.5, value=2.0, step=0.5)
    weekend_hours = st.number_input("休日の勉強時間 (時)", min_value=0.5, value=5.0, step=0.5)
    
    st.divider()
    st.subheader("科目別難易度 (1:低 〜 5:高)")
    weights = {}
    for sub in subject_list:
        weights[sub] = st.slider(f"{sub} の難易度", 1, 5, 3)

    generate_btn = st.button("スケジュールを提案してもらう", type="primary")

# --- スケジュール生成ロジック ---
def generate_schedule(start_date, end_date, subjects, weights, weekday_h, weekend_h):
    days = (end_date - start_date).days
    if days <= 0:
        return None
    
    total_weight = sum(weights.values())
    sched_data = []
    
    for i in range(days):
        current_day = start_date + timedelta(days=i)
        is_weekend = current_day.weekday() >= 5
        daily_limit = weekend_h if is_weekend else weekday_h
        
        # 難易度に応じて各科目の時間を配分
        for sub in subjects:
            allocated_h = round((weights[sub] / total_weight) * daily_limit, 1)
            sched_data.append({
                "日付": current_day,
                "曜日": ["月", "火", "水", "木", "金", "土", "日"][current_day.weekday()],
                "科目": sub,
                "目標時間": allocated_h,
                "完了": False
            })
    return pd.DataFrame(sched_data)

if generate_btn:
    st.session_state.schedule = generate_schedule(date.today(), test_date, subject_list, weights, weekday_hours, weekend_hours)
    st.success("新しいスケジュールを生成しました！")

# --- メインコンテンツ ---
if st.session_state.schedule is not None:
    df = st.session_state.schedule
    today = date.today()
    
    col1, col2 = st.columns([2, 1])

    with col1:
        st.subheader("📅 学習スケジュール")
        # 本日以降の予定を表示
        display_df = df[df["日付"] >= today].copy()
        st.dataframe(display_df, use_container_width=True, hide_index=True)

    with col2:
        st.subheader("📝 今日の進捗入力")
        target_today = df[df["日付"] == today]
        
        if not target_today.empty:
            total_target = target_today["目標時間"].sum()
            st.info(f"今日の目標合計: {total_target} 時間")
            
            actual_h = st.number_input("実際の勉強時間 (時)", min_value=0.0, max_value=24.0, step=0.5)
            
            if st.button("進捗を確定する"):
                diff = actual_h - total_target
                
                # --- ほめる・けなすロジック ---
                if diff >= 0:
                    st.balloons()
                    st.success(f"素晴らしい！目標より {abs(diff)}時間多く頑張りましたね。この調子で合格を掴みましょう！")
                elif diff > -1:
                    st.warning(f"あと少しでしたね。明日はこの {abs(diff)}時間を調整して取り戻しましょう。")
                else:
                    st.error(f"今日は {abs(diff)}時間足りません。喝！今のままだと弱点は克服できませんよ。")
                
                # --- リスケジュール（足りない分を明日以降に分配） ---
                if diff < 0:
                    undone_hours = abs(diff)
                    future_indices = df[df["日付"] > today].index
                    if len(future_indices) > 0:
                        extra_per_slot = undone_hours / len(future_indices)
                        st.session_state.schedule.loc[future_indices, "目標時間"] += round(extra_per_slot, 2)
                        st.info("足りなかった時間を明日以降のスケジュールに再分配しました。")
        else:
            st.write("今日の予定はありません。")

else:
    st.info("サイドバーから条件を入力してスケジュールを作成してください。")

# --- プロジェクト管理（進捗グラフ） ---
if st.session_state.schedule is not None:
    st.divider()
    st.subheader("📊 全体進捗の可視化")
    progress_chart = st.session_state.schedule.groupby("科目")["目標時間"].sum().reset_index()
    st.bar_chart(progress_chart, x="科目", y="目標時間")