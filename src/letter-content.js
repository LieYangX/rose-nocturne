/**
 * 信件文案总表
 *
 * 你只需要改这个文件，页面会自动读取，不需要再动 main.js 或 index.html。
 * - frontHtml / completeFrontHtml 支持 <br> 换行
 * - back 是一整封信，数组里的每一项占一行
 * - secretLetter.paragraphs 是隐藏长信的段落
 * - dailyLines 是信卡正面每日一句的文案池
 */
export const LETTER_CONTENT = {
    loveLetter: {
        frontEyebrow: 'To 刘烨',
        backEyebrow: '给刘烨',
        completeEyebrow: 'To 刘烨 · 19 / 19',
        frontHtml: '花花来啦，希望你会喜欢哈哈哈哈哈',
        completeFrontHtml: '十九朵玫瑰，你都听见了嘛。<br>别说AI写的其实蛮不错。就是没有人味！！（有点嫌弃哈哈哈哈），那么恭喜你找到全部啦！你真棒！，开心😀！',
        back: [
            '刘烨：',
            '',
            '花会开也会谢，歌也可能会跑掉，但哥不会跑掉，哈哈哈哈哈哈哈',
            '',
            '电子赛博玫瑰送给你，希望你能一直开心！！！！不要乱七八糟想，我都有点患得患失的感觉了呢！！！！！！呜呜呜呜'
        ].join('\n')
    },
    secretLetter: {
        eyebrow: 'A HIDDEN LETTER · To 刘烨',
        title: '你找到了那朵金色的玫瑰',
        paragraphs: [
            '刘烨：',
            '哇！！金色传说！！都被你找到啦，好厉害呀！！',
            '虽然我表达的少，但是我做的多呀哈哈哈哈哈哈，也许就是这样你看不懂我吧，是不',
            'emmmm,我想想办法怎么才能让你更喜欢我呢！！！'
        ],
        closeLabel: '收好这封信'
    },
    dailyLines: {
        morning: [
            '早安，今天也要开心。',
            '醒来有花，今天会很好。',
            '把清晨的第一束光送给你。'
        ],
        afternoon: [
            '午后的花，和想你的心一样明亮。',
            '今天也偷偷想你了。',
            '愿这束花点亮你的下午。'
        ],
        evening: [
            '今夜玫瑰替我说话。',
            '今晚的浪漫专属于你。',
            '忙完一天，来看看花吧。'
        ],
        late: [
            '晚安，梦里也要有花香。',
            '夜深了，花替你守着好梦。',
            '今天辛苦了，晚安。'
        ]
    }
};
