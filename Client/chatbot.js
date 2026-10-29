// ===================================================
//  NutriAI Chatbot — Phiên bản Hoàn chỉnh & Sửa lỗi 400
// ===================================================

let isSending = false;
let chatHistory = []; // Khai báo biến lưu lịch sử chat

// Cấu hình kết nối API thông qua Backend của bạn
const API_CONFIG = {
    BASE_URL: window.location.origin, // Tự động nhận localhost hoặc domain Render
    GENERATE_URL: "/api/chat/generate",
    EXPORT_EXCEL_URL: "/api/export-excel",
    SAVE_SCHEDULE_URL: "/api/user/schedules"
};

// --- 1. XỬ LÝ ĐỒNG BỘ DỮ LIỆU TỪ GIAO DIỆN ---
function buildNutritionContext() {
    const t = (typeof targets !== 'undefined') ? targets : { kcal: 0, p: 0, l: 0, c: 0 };
    const log = (typeof dailyLog !== 'undefined') ? dailyLog : { sang: [], trua: [], toi: [] };
    
    const getName = (id) => document.getElementById(id)?.value || 'Chưa điền';
    const getBmi = () => document.getElementById('bmi-result')?.innerText || 'Chưa tính BMI';
    const getDisease = () => document.getElementById('disease')?.value || 'Không có';

    let menu = "";
    ['sang', 'trua', 'toi'].forEach(m => {
        menu += `\nBữa ${m}: ` + (log[m].map(i => `${i.name}(${i.weight}g)`).join(', ') || "Trống (Chưa có món ăn nào được lên lịch)");
    });

    return { 
        info: `Tên người dùng: ${getName('fullname')} | Tuổi: ${getName('age')} | Giới tính: ${document.getElementById('gender')?.value || 'Nam'} | Chiều cao: ${getName('height')}cm | Cân nặng: ${getName('weight')}kg | Chỉ số hiện tại: ${getBmi()} | Bệnh nền: ${getDisease()} | Calo TDEE: ${t.kcal} kcal | Mục tiêu chất (P:${t.p}g, L:${t.l}g, C:${t.c}g)`,
        menu: menu
    };
}

function buildSystemPrompt(ctx) {
    return `Bạn là NutriAI, một chuyên gia dinh dưỡng chuyên nghiệp tại Việt Nam.
Thông số người dùng hiện tại:
- Hồ sơ: ${ctx.info}
- Nhật ký thực đơn hôm nay: ${ctx.menu}

MỤC TIÊU CỦA BẠN:
Tạo ra các đề xuất thực đơn hoặc giải đáp thắc mắc về dinh dưỡng thật tự nhiên, ngắn gọn và hữu ích. Giọng điệu thân thiện, giống như một bác sĩ đang tư vấn trực tiếp cho bệnh nhân.

HƯỚNG DẪN TRÌNH BÀY:
1. Khi đề xuất thực đơn, hãy chia rõ thành các bữa (Bữa Sáng, Bữa Trưa, Bữa Tối).
2. Mỗi món ăn nên dùng gạch đầu dòng, ghi rõ Khối lượng (g) và Lượng Calo ước tính để người dùng dễ theo dõi.
3. Nếu bệnh nền là "Tiểu đường", gợi ý gạo lứt/yến mạch. Nếu "Gút", tránh thịt đỏ/hải sản.
4. Chốt lại tổng lượng calo ước tính ở cuối câu trả lời.
5. Cuối cùng, hãy luôn đưa ra 3 câu hỏi gợi ý ngắn gọn mà người dùng có thể muốn hỏi tiếp theo. Định dạng: [Gợi ý: câu 1 | câu 2 | câu 3]`;
}

// --- 2. CƠ CHẾ GỌI AI VÀ XỬ LÝ LUỒNG CHAT ---
async function handleChatFlow(inputId, messageContainerId) {
    if (isSending) return;
    const inputEl = document.getElementById(inputId);
    const text = inputEl.value.trim();
    if (!text) return;

    appendMessage(messageContainerId, 'user', text);
    inputEl.value = '';
    isSending = true;

    const typingId = appendTyping(messageContainerId);
    const ctx = buildNutritionContext();
    const systemPrompt = buildSystemPrompt(ctx);
    const disease = document.getElementById('disease')?.value || 'Không có';

    // Thêm câu hỏi hiện tại vào lịch sử
    chatHistory.push({ role: "user", content: text });
    
    if (chatHistory.length > 12) {
        chatHistory = chatHistory.slice(-12);
    }

    try {
        const response = await fetch(API_CONFIG.GENERATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: chatHistory,
                systemPrompt: systemPrompt,
                disease: disease
            })
        });

        const data = await response.json();
        removeTyping(typingId);

        if (!response.ok) throw new Error(data.error || 'Lỗi kết nối server.');

        if (data.choices && data.choices.length > 0) {
            let botReply = data.choices[0].message.content;
            chatHistory.push({ role: "assistant", content: botReply });
            
            // Tự động nhận diện nếu đây là lịch trình tuần/ngày để hiện nút
            let isWeeklyPlan = botReply.toLowerCase().includes("thứ") || botReply.toLowerCase().includes("ngày") || botReply.toLowerCase().includes("thực đơn");
            appendMessage(messageContainerId, 'bot', botReply, isWeeklyPlan);
        }
    } catch (error) {
        chatHistory.pop();
        removeTyping(typingId);
        appendMessage(messageContainerId, 'bot', `⚠️ Lỗi hệ thống: ${error.message}.`);
    }
    isSending = false;
}

// --- 3. ĐIỀU KHIỂN TƯƠNG TÁC GIAO DIỆN (UI) ---
function toggleChat() {
    const win = document.getElementById('nutri-window');
    const badge = document.getElementById('nutri-badge');
    const icon = document.getElementById('nutri-bubble-icon');
    const isOpen = win.style.display === 'flex';
    
    win.style.display = isOpen ? 'none' : 'flex';
    win.style.flexDirection = 'column';
    if (!isOpen && badge) badge.style.display = 'none';
    if (icon) icon.textContent = isOpen ? '💬' : '✕';
    if (!isOpen) scrollChatToBottom('nutri-messages');
}

function quickSend(text) {
    document.getElementById('nutri-input').value = text;
    sendChat();
}

async function sendChat() {
    await handleChatFlow('nutri-input', 'nutri-messages');
}

function quickSendInline(text) {
    document.getElementById('inline-nutri-input').value = text;
    sendChatInline();
}

async function sendChatInline() {
    await handleChatFlow('inline-nutri-input', 'inline-nutri-messages');
}

// Hàm format tin nhắn: Chuyển đổi dấu ** thành thẻ in đậm và xử lý xuống dòng
function formatMessage(text) {
    let cleanText = text.replace(/\[Gợi ý:.*?\]/g, '').trim(); // Loại bỏ phần gợi ý khỏi nội dung hiển thị
    
    // Nếu tin nhắn chứa thẻ HTML của Cảnh Báo (warning-box), thì không cần replace \n thành <br> cho phần đó
    // để tránh bị cách dòng quá thưa thớt
    if (cleanText.includes('<div class="warning-box"')) {
        // Chỉ format phần in đậm
        return cleanText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    }
    
    let formatted = cleanText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); // Chuyển **chữ** thành <b>chữ</b>
    formatted = formatted.replace(/\n/g, '<br>'); // Xuống dòng
    return formatted;
}

window.chatDataMap = {}; // Lưu trữ data tin nhắn để xuất Excel

async function downloadChatAsExcel(msgId) {
    const text = window.chatDataMap[msgId];
    if (!text) return;
    
    let userInfo = null;
    const token = localStorage.getItem('token');
    
    // Thử lấy thông tin người dùng nếu đã đăng nhập để đưa vào Excel
    if (token) {
        try {
            const res = await fetch(API_CONFIG.BASE_URL + '/api/user/profile', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                userInfo = await res.json();
            }
        } catch (e) {
            console.log("Không thể lấy thông tin user cho Excel");
        }
    }
    
    try {
        const response = await fetch(API_CONFIG.EXPORT_EXCEL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                meal_data: text,
                user_info: userInfo 
            })
        });

        if (!response.ok) throw new Error("Lỗi xuất file");

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Ho_So_Dinh_Duong_NutriAI_${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (error) {
        alert("Không thể tải file Excel: " + error.message);
    }
}

async function saveScheduleToProfile(msgId) {
    const text = window.chatDataMap[msgId];
    if (!text) return;

    const token = localStorage.getItem('token');
    if (!token) {
        alert("Vui lòng đăng nhập để lưu lịch trình!");
        return;
    }

    try {
        const response = await fetch(API_CONFIG.SAVE_SCHEDULE_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                date: new Date().toLocaleDateString('vi-VN'),
                meal_data: text
            })
        });

        const data = await response.json();
        if (response.ok) {
            alert("✅ Đã lưu lịch trình vào hồ sơ của bạn!");
        } else {
            throw new Error(data.error || "Lỗi khi lưu");
        }
    } catch (error) {
        alert("Lỗi: " + error.message);
    }
}

function appendMessage(containerId, role, text, isWeeklyPlan = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    
    let displayHtml = formatMessage(text);
    
    if (role === 'bot' && isWeeklyPlan) {
        const msgId = 'msg-' + Date.now();
        window.chatDataMap[msgId] = text;
        displayHtml += `<div style="margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn" style="background-color: #1D6F42; color: white; padding: 6px 12px; border-radius: 6px; font-size: 13px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;" onclick="downloadChatAsExcel('${msgId}')"><i class="fa-solid fa-file-excel"></i> Tải (Excel)</button>
            <button class="btn" style="background-color: #00796B; color: white; padding: 6px 12px; border-radius: 6px; font-size: 13px; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;" onclick="saveScheduleToProfile('${msgId}')"><i class="fa-solid fa-cloud-arrow-up"></i> Lưu hồ sơ</button>
        </div>`;
    }

    div.innerHTML = role === 'bot' 
        ? `<div class="msg-avatar"><i class="fa-solid fa-robot"></i></div><div class="msg-bubble">${displayHtml}</div>`
        : `<div class="msg-bubble">${displayHtml}</div><div class="msg-avatar"><i class="fa-solid fa-user"></i></div>`;
    
    container.appendChild(div);

    // Xử lý Gợi ý (Suggestions) nếu có
    if (role === 'bot') {
        const suggestionMatch = text.match(/\[Gợi ý:(.*?)\]/);
        if (suggestionMatch && suggestionMatch[1]) {
            const suggestions = suggestionMatch[1].split('|').map(s => s.trim());
            const quickDiv = document.createElement('div');
            quickDiv.className = 'chat-quick';
            quickDiv.style.marginTop = '8px';
            quickDiv.style.justifyContent = 'flex-start';
            
            suggestions.forEach(s => {
                if (!s) return;
                const btn = document.createElement('button');
                btn.textContent = s;
                // Xác định hàm gửi dựa trên container
                const sendFn = containerId.includes('inline') ? 'quickSendInline' : 'quickSend';
                btn.onclick = () => window[sendFn](s);
                quickDiv.appendChild(btn);
            });
            container.appendChild(quickDiv);
        }
    }

    scrollChatToBottom(containerId);
}

function appendTyping(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.id = id; div.className = 'chat-msg bot';
    div.innerHTML = `<div class="msg-avatar"><i class="fa-solid fa-robot" style="color: #00796B; font-size: 20px;"></i></div><div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
    container.appendChild(div);
    scrollChatToBottom(containerId);
    return id;
}

function removeTyping(id) { document.getElementById(id)?.remove(); }
function scrollChatToBottom(id) {
    const container = document.getElementById(id);
    if (container) container.scrollTop = container.scrollHeight;
}

// ===================================================
// TÍNH NĂNG 4: LỊCH ĂN UỐNG 7 NGÀY (CÓ BỮA PHỤ & GIỜ)
// ===================================================
function openWeeklyScheduleModal() {
    const modal = document.getElementById('weekly-schedule-modal');
    modal.style.display = 'flex';
    generateWeeklySchedule();
}

async function generateWeeklySchedule() {
    const loading = document.getElementById('schedule-loading');
    const content = document.getElementById('schedule-content');
    loading.style.display = 'block';
    content.style.display = 'none';

    const ctx = buildNutritionContext();
    
    // Prompt yêu cầu AI trả về định dạng JSON thuần túy để vẽ bảng
    const prompt = `Bạn là NutriAI, chuyên gia dinh dưỡng.
Hồ sơ bệnh nhân: ${ctx.info}

NHIỆM VỤ:
Lập lịch ăn uống 7 ngày (Thứ 2 đến Chủ nhật) bám sát lượng calo TDEE và mục tiêu giảm/tăng cân (nếu có).
Bao gồm 3 bữa chính và 2 bữa phụ (snack).
Bắt buộc có khung giờ cụ thể cho từng bữa.

ĐỊNH DẠNG TRẢ VỀ:
BẮT BUỘC chỉ trả về 1 chuỗi JSON hợp lệ, KHÔNG có văn bản nào khác, KHÔNG có markdown, KHÔNG giải thích.
Cấu trúc JSON chính xác như sau:
{
  "schedule": [
    {
      "day": "Thứ 2",
      "meals": [
        { "time": "07:00", "type": "Bữa sáng", "food": "Cơm gạo lứt (150g), Ức gà (100g)" },
        { "time": "09:30", "type": "Bữa phụ sáng", "food": "Sữa chua không đường (1 hộp)" },
        { "time": "12:30", "type": "Bữa trưa", "food": "..." },
        { "time": "15:30", "type": "Bữa phụ chiều", "food": "..." },
        { "time": "19:00", "type": "Bữa tối", "food": "..." }
      ]
    }
  ]
}`;

    try {
        const response = await fetch(API_CONFIG.GENERATE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: "user", content: prompt }],
                systemPrompt: "Bạn là một máy chủ trả về JSON thuần túy.",
                disease: document.getElementById('disease')?.value || 'Không có'
            })
        });

        if (!response.ok) throw new Error("Lỗi kết nối API");
        const data = await response.json();
        
        // Parse JSON từ câu trả lời của AI (loại bỏ markdown block nếu có)
        let rawContent = data.choices[0].message.content.trim();
        if (rawContent.startsWith("```")) {
            rawContent = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        }
        let planData = JSON.parse(rawContent);
        
        // Vẽ bảng HTML
        let tableHtml = `<table class="schedule-table">
            <thead>
                <tr>
                    <th style="width: 15%">Thời gian</th>
                    <th style="width: 20%">Bữa ăn</th>
                    <th style="width: 65%">Thực đơn gợi ý</th>
                </tr>
            </thead>
            <tbody>`;
            
        planData.schedule.forEach(dayInfo => {
            tableHtml += `<tr class="schedule-day-row"><td colspan="3">${dayInfo.day}</td></tr>`;
            dayInfo.meals.forEach(meal => {
                tableHtml += `
                <tr>
                    <td class="schedule-time">${meal.time}</td>
                    <td class="schedule-type">${meal.type}</td>
                    <td>${meal.food}</td>
                </tr>`;
            });
        });
        tableHtml += `</tbody></table>`;
        
        content.innerHTML = tableHtml;
        loading.style.display = 'none';
        content.style.display = 'block';

    } catch (error) {
        loading.style.display = 'none';
        content.style.display = 'block';
        content.innerHTML = `<p style="color:red; text-align:center;">Lỗi tạo lịch: Do quá tải hoặc lỗi định dạng dữ liệu, vui lòng thử lại sau vài giây.</p>`;
        console.error(error);
    }
}
