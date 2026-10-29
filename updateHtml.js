const fs = require('fs');
let html = fs.readFileSync('Client/index.html', 'utf8');

const oldSuggestionsStyle = 'id="suggestions" class="card" style="padding: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #e0e0e0;"';
const newSuggestionsStyle = 'id="suggestions" class="card" style="padding: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #e0e0e0; min-height: 500px;"';
html = html.replace(oldSuggestionsStyle, newSuggestionsStyle);

const modalAlert = `
    <!-- MODAL CẢNH BÁO TỰ ĐỘNG -->
    <div id="ai-alert-modal" style="display: none; position: fixed; inset: 0; z-index: 10000; background: rgba(0, 0, 0, 0.5); align-items: center; justify-content: center; padding: 20px;">
        <div style="background: white; border-radius: 16px; width: 100%; max-width: 450px; overflow: hidden; box-shadow: 0 10px 40px rgba(229, 57, 53, 0.2);">
            <div style="background: #e53935; color: white; padding: 15px 20px; font-weight: bold; font-size: 18px; display: flex; align-items: center; gap: 10px;">
                <span>⚠️</span> <span>Cảnh Báo Từ NutriAI</span>
            </div>
            <div style="padding: 24px;">
                <p id="ai-alert-message" style="font-size: 15px; color: #333; line-height: 1.5; margin-bottom: 24px;"></p>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button onclick="document.getElementById('ai-alert-modal').style.display='none'" style="padding: 10px 20px; border: none; background: #e0e0e0; color: #333; border-radius: 8px; cursor: pointer; font-weight: bold;">Bỏ qua</button>
                    <button onclick="forceAddFood()" style="padding: 10px 20px; border: none; background: #e53935; color: white; border-radius: 8px; cursor: pointer; font-weight: bold;">Vẫn thêm vào</button>
                </div>
            </div>
        </div>
    </div>
</section>
`;

html = html.replace('</section>\r\n\r\n    <section class="meals-features">', modalAlert + '\r\n    <section class="meals-features">');
html = html.replace('</section>\n\n    <section class="meals-features">', modalAlert + '\n    <section class="meals-features">');

fs.writeFileSync('Client/index.html', html);
