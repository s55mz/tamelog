# 貯めログ API設計

更新日: 2026-03-12

この文書は、貯めログの API 契約を定義します。
フロント実装、バックエンド実装、テスト作成の基準にします。

## 1. API 全体ルール

### 1.1 共通

- ベースパスは `/api`
- 形式は JSON
- 認証は `Authorization: Bearer <token>`
- 日付入力は原則 `YYYY-MM-DD`
- 金額は円単位の整数

### 1.2 共通レスポンス

成功例:

```json
{
  "data": {}
}
```

失敗例:

```json
{
  "error": "メールアドレスまたはパスワードが違います"
}
```

### 1.3 ステータスコード

- `200` 取得、更新成功
- `201` 作成成功
- `400` バリデーションエラー
- `401` 未認証
- `403` 権限不足
- `404` 該当なし
- `409` 競合
- `500` 想定外エラー

### 1.4 エラーメッセージ方針

- ユーザー向けは日本語
- 短くする
- 内部情報を出しすぎない

例:

- `入力内容を確認してください`
- `招待リンクの有効期限が切れています`
- `この操作を行う権限がありません`

## 2. 認証とセットアップ

### 2.1 `GET /api/setup/status`

用途:

- 起動直後にセットアップ状態を確認

レスポンス:

```json
{
  "data": {
    "installed": false,
    "dbReady": true
  }
}
```

### 2.2 `POST /api/setup/test-db`

用途:

- DB 接続確認

リクエスト:

```json
{}
```

レスポンス:

```json
{
  "data": {
    "success": true
  }
}
```

### 2.3 `POST /api/setup/install`

用途:

- 初回セットアップ完了

リクエスト:

```json
{
  "adminName": "管理者",
  "adminEmail": "admin@example.com",
  "password": "Pass123!",
  "appName": "貯めログ",
  "paydayOfMonth": 25
}
```

レスポンス:

```json
{
  "data": {
    "installed": true
  }
}
```

バリデーション:

- すでにセットアップ済みなら `409`
- `paydayOfMonth` は 1-31

### 2.4 `POST /api/auth/login`

リクエスト:

```json
{
  "email": "user@example.com",
  "password": "Pass123!"
}
```

レスポンス:

```json
{
  "data": {
    "token": "jwt",
    "user": {
      "id": "usr_xxx",
      "name": "ユーザー",
      "email": "user@example.com",
      "role": "USER",
      "status": "ACTIVE",
      "setupCompleted": true,
      "paydayOfMonth": 25
    }
  }
}
```

### 2.5 `GET /api/auth/me`

用途:

- リロード時のログイン復元

レスポンス:

```json
{
  "data": {
    "user": {
      "id": "usr_xxx",
      "name": "ユーザー",
      "email": "user@example.com",
      "role": "USER",
      "status": "ACTIVE",
      "setupCompleted": true,
      "paydayOfMonth": 25
    }
  }
}
```

### 2.6 `POST /api/auth/register`

用途:

- 招待制登録

リクエスト:

```json
{
  "token": "invite_token",
  "name": "山田",
  "email": "user@example.com",
  "password": "Pass123!"
}
```

ルール:

- `email` は招待時メールアドレスと一致必須
- 招待が `ACTIVE` で有効期限内であること

レスポンス:

```json
{
  "data": {
    "user": {
      "id": "usr_xxx",
      "name": "山田",
      "email": "user@example.com",
      "role": "USER",
      "setupCompleted": false,
      "paydayOfMonth": 1
    }
  }
}
```

### 2.7 `POST /api/auth/logout`

用途:

- クライアント側のログアウト補助

レスポンス:

```json
{
  "data": {
    "success": true
  }
}
```

## 3. ユーザー API

### 3.1 `GET /api/users/me`

レスポンス:

```json
{
  "data": {
    "id": "usr_xxx",
    "name": "山田",
    "email": "user@example.com",
    "role": "USER",
    "status": "ACTIVE",
    "setupCompleted": true,
    "paydayOfMonth": 25,
    "streakDays": 4
  }
}
```

### 3.2 `PUT /api/users/me`

用途:

- プロフィール更新

リクエスト:

```json
{
  "name": "山田 太郎",
  "email": "new@example.com",
  "currentPassword": "Pass123!",
  "paydayOfMonth": 25
}
```

ルール:

- メール変更時は `currentPassword` 必須
- `paydayOfMonth` 変更は許可するが過去 `periodId` は変えない

### 3.3 `POST /api/users/me/complete-setup`

用途:

- 初期設定完了

リクエスト:

```json
{
  "paydayOfMonth": 25,
  "initialAccount": {
    "name": "メイン口座",
    "type": "BANK",
    "balance": 100000
  },
  "goals": [
    {
      "title": "旅行",
      "targetAmount": 50000,
      "deadline": "2026-09-30"
    }
  ]
}
```

ルール:

- `initialAccount` は省略可
- `goals` は最大 3 件

### 3.4 `GET /api/users/me/stats`

用途:

- ホーム / 設定の簡易統計

レスポンス:

```json
{
  "data": {
    "currentPeriodId": "2026-02-25",
    "incomeTotal": 250000,
    "expenseTotal": 120000,
    "savingTotal": 30000,
    "streakDays": 4
  }
}
```

## 4. 口座 API

### 4.1 `GET /api/accounts`

レスポンス:

```json
{
  "data": {
    "accounts": [
      {
        "id": "acc_xxx",
        "name": "メイン口座",
        "type": "BANK",
        "balance": 150000,
        "isPrimary": true,
        "sortOrder": 1
      }
    ],
    "totalBalance": 150000
  }
}
```

### 4.2 `POST /api/accounts`

リクエスト:

```json
{
  "name": "現金",
  "type": "CASH",
  "balance": 10000,
  "isPrimary": false
}
```

### 4.3 `PUT /api/accounts/:id`

リクエスト:

```json
{
  "name": "財布",
  "isPrimary": true,
  "sortOrder": 2
}
```

### 4.4 `DELETE /api/accounts/:id`

ルール:

- 紐付く `DailyRecord` または `AccountTransfer` がある場合は `409`

## 5. 記録 API

### 5.1 `GET /api/records`

クエリ:

- `periodId`
- `dateFrom`
- `dateTo`
- `type`
- `accountId`
- `limit`
- `page`

レスポンス:

```json
{
  "data": {
    "records": [
      {
        "id": "rec_xxx",
        "type": "EXPENSE",
        "amount": 1200,
        "memo": "昼食",
        "recordDate": "2026-03-12",
        "periodId": "2026-02-25",
        "account": {
          "id": "acc_xxx",
          "name": "財布"
        },
        "category": {
          "id": "cat_xxx",
          "name": "食費"
        },
        "goal": null
      }
    ],
    "summary": {
      "incomeTotal": 250000,
      "expenseTotal": 120000,
      "savingTotal": 30000
    },
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 80
    }
  }
}
```

### 5.2 `POST /api/records`

リクエスト:

```json
{
  "type": "SAVING",
  "accountId": "acc_xxx",
  "categoryId": null,
  "goalId": "goal_xxx",
  "amount": 10000,
  "memo": "今月の積立",
  "recordDate": "2026-03-12"
}
```

レスポンス:

```json
{
  "data": {
    "record": {
      "id": "rec_xxx",
      "type": "SAVING",
      "amount": 10000,
      "periodId": "2026-02-25"
    },
    "account": {
      "id": "acc_xxx",
      "balance": 140000
    }
  }
}
```

バリデーション:

- `amount > 0`
- `goalId` は `SAVING` のみ
- `categoryId` は `type` とカテゴリ種別一致必須

### 5.3 `PUT /api/records/:id`

用途:

- 種別変更を含む編集

リクエスト:

```json
{
  "type": "EXPENSE",
  "accountId": "acc_xxx",
  "categoryId": "cat_food",
  "goalId": null,
  "amount": 2000,
  "memo": "買い物",
  "recordDate": "2026-03-12"
}
```

ルール:

- 更新は差分更新ではなく、旧影響取り消し + 新影響適用

### 5.4 `DELETE /api/records/:id`

レスポンス:

```json
{
  "data": {
    "success": true
  }
}
```

## 6. 口座移動 API

### 6.1 `GET /api/account-transfers`

クエリ:

- `periodId`
- `limit`

### 6.2 `POST /api/account-transfers`

リクエスト:

```json
{
  "fromAccountId": "acc_cash",
  "toAccountId": "acc_bank",
  "amount": 5000,
  "memo": "入金",
  "recordDate": "2026-03-12"
}
```

バリデーション:

- `fromAccountId != toAccountId`
- `amount > 0`

## 7. 目標 API

### 7.1 `GET /api/goals`

レスポンス:

```json
{
  "data": {
    "goals": [
      {
        "id": "goal_xxx",
        "title": "旅行",
        "targetAmount": 50000,
        "currentAmount": 20000,
        "achievementRate": 40,
        "deadline": "2026-09-30",
        "remainingAmount": 30000,
        "remainingDays": 84,
        "visual": {
          "category": "TRAVEL",
          "subcategory": "suitcase",
          "theme": "SOFT",
          "step": 3,
          "imagePath": "/goal-assets/soft/travel_suitcase_3.png",
          "completeImagePath": "/goal-assets/soft/travel_suitcase_complete.png",
          "altText": "旅行用スーツケースの進捗イラスト",
          "headlineText": "旅行の準備をしよう"
        }
      }
    ]
  }
}
```

補足:

- `currentAmount` はレスポンス計算値

### 7.2 `POST /api/goals`

リクエスト:

```json
{
  "title": "旅行",
  "targetAmount": 50000,
  "deadline": "2026-09-30",
  "note": "夏までに",
  "visualTheme": "SOFT"
}
```

レスポンス:

```json
{
  "data": {
    "goal": {
      "id": "goal_xxx",
      "title": "旅行",
      "visualCategory": "TRAVEL",
      "visualSubcategory": "suitcase",
      "visualTheme": "SOFT",
      "visualLocked": false
    },
    "classification": {
      "source": "ai",
      "confidence": 0.86
    }
  }
}
```

### 7.3 `PUT /api/goals/:id`

用途:

- 目標更新
- タイトル変更時の再分類
- 手動で画像カテゴリを上書き

リクエスト例:

```json
{
  "title": "iPad Air",
  "targetAmount": 90000,
  "deadline": "2026-07-31",
  "visualTheme": "CALM",
  "visual": {
    "category": "ITEMS",
    "subcategory": "tablet",
    "locked": true
  }
}
```

### 7.4 `DELETE /api/goals/:id`

ルール:

- 関連 `GoalRecord` は cascade delete

### 7.5 `GET /api/goals/:id/records`

レスポンス:

```json
{
  "data": {
    "goal": {
      "id": "goal_xxx",
      "title": "旅行"
    },
    "records": [
      {
        "id": "gr_xxx",
        "amount": 10000,
        "recordDate": "2026-03-12",
        "periodId": "2026-02-25"
      }
    ]
  }
}
```

### 7.6 `POST /api/goals/:id/classify-visual`

用途:

- 目標の画像カテゴリを AI で再判定

リクエスト:

```json
{
  "title": "新しいカメラ",
  "note": "旅行用"
}
```

レスポンス:

```json
{
  "data": {
    "visual": {
      "category": "HOBBY",
      "subcategory": "camera",
      "theme": "SOFT",
      "step": 1,
      "imagePath": "/goal-assets/soft/hobby_camera_1.png",
      "headlineText": "新しい楽しみの準備をしよう"
    },
    "classification": {
      "source": "ai",
      "confidence": 0.91
    }
  }
}
```

## 8. カテゴリ API

### 8.1 `GET /api/categories`

クエリ:

- `type=INCOME|EXPENSE`

### 8.2 `POST /api/categories`

リクエスト:

```json
{
  "name": "交際費",
  "type": "EXPENSE",
  "icon": "users",
  "sortOrder": 5
}
```

### 8.3 `PUT /api/categories/:id`

### 8.4 `DELETE /api/categories/:id`

ルール:

- 使用中カテゴリは `409`

### 8.5 `POST /api/categories/reset-defaults`

用途:

- 現カテゴリを初期セットへ戻す

ルール:

- 使用中カテゴリがある場合の扱いは v1 では「リセット不可」を推奨

## 9. 衝動買い API

### 9.1 `GET /api/impulse-items`

レスポンス:

```json
{
  "data": {
    "waiting": [],
    "history": []
  }
}
```

### 9.2 `POST /api/impulse-items`

リクエスト:

```json
{
  "name": "ヘッドホン",
  "price": 18000,
  "message": "本当に必要か確認"
}
```

### 9.3 `PUT /api/impulse-items/:id`

用途:

- `WAITING` から `BOUGHT` or `SKIPPED`

リクエスト:

```json
{
  "status": "SKIPPED"
}
```

ルール:

- 24 時間経過前は更新不可

### 9.4 `DELETE /api/impulse-items/:id`

ルール:

- v1 では待機中も履歴も削除可にするかは未実装時に判断可
- 安全側は「待機中のみ削除可」

## 10. AI API

### 10.1 `POST /api/chat`

用途:

- AI 相談

リクエスト:

```json
{
  "message": "今月の使いすぎを減らしたい"
}
```

レスポンス:

```json
{
  "data": {
    "reply": "今月は食費が多めですが、貯金も続いています。..."
  }
}
```

ルール:

- 1 日 20 回上限
- OpenAI 未設定時は `503` でもよいが、UI 用に分かりやすい `error` を返す

### 10.2 `GET /api/analysis`

クエリ:

- `month=2026-03`

### 10.3 `POST /api/analysis/generate`

リクエスト:

```json
{
  "month": "2026-03"
}
```

ルール:

- 同月が存在すれば上書き

## 11. 管理者 API

### 11.1 `GET /api/admin/users`

レスポンス:

```json
{
  "data": {
    "users": [
      {
        "id": "usr_xxx",
        "name": "山田",
        "email": "user@example.com",
        "role": "USER",
        "status": "ACTIVE",
        "setupCompleted": true,
        "createdAt": "2026-03-12T00:00:00.000Z"
      }
    ],
    "summary": {
      "total": 3,
      "adminCount": 1,
      "userCount": 2
    }
  }
}
```

### 11.2 `POST /api/admin/users/:id/suspend`

用途:

- ユーザー停止

リクエスト:

```json
{
  "status": "SUSPENDED"
}
```

### 11.3 `POST /api/admin/invitations`

リクエスト:

```json
{
  "email": "invitee@example.com"
}
```

レスポンス:

```json
{
  "data": {
    "invitation": {
      "id": "inv_xxx",
      "email": "invitee@example.com",
      "token": "token",
      "status": "ACTIVE",
      "expiresAt": "2026-03-19T00:00:00.000Z"
    },
    "registerUrl": "https://example.com/register?token=token"
  }
}
```

### 11.4 `GET /api/admin/invitations`

### 11.5 `POST /api/admin/invitations/:id/revoke`

用途:

- 未使用招待を手動失効

### 11.6 `GET /api/admin/config`

レスポンス:

```json
{
  "data": {
    "appName": "貯めログ",
    "defaultPayday": 25,
    "smtp": {
      "host": "smtp.example.com",
      "port": 587,
      "user": "mailer",
      "from": "no-reply@example.com",
      "configured": true
    },
    "openai": {
      "configured": true
    }
  }
}
```

### 11.7 `PUT /api/admin/config`

用途:

- SMTP / OpenAI / 基本設定の更新

リクエスト:

```json
{
  "appName": "貯めログ",
  "defaultPayday": 25,
  "smtp": {
    "host": "smtp.example.com",
    "port": 587,
    "user": "mailer",
    "pass": "secret",
    "from": "no-reply@example.com"
  },
  "openai": {
    "apiKey": "sk-..."
  }
}
```

### 11.8 `POST /api/admin/test-email`

リクエスト:

```json
{
  "to": "admin@example.com"
}
```

### 11.9 `GET /api/admin/system-info`

レスポンス:

```json
{
  "data": {
    "nodeVersion": "v20.0.0",
    "platform": "linux",
    "uptimeSec": 12345,
    "memoryUsage": {
      "rss": 123456789
    },
    "dbReady": true
  }
}
```

## 12. ホーム / 進捗向け集約データ

### 12.1 集約をどこで返すか

ホーム画像がコア体験なので、v1 からホーム専用 API を持つ。

### 12.2 `GET /api/dashboard`

用途:

- ホーム画面を 1 回で描画するための集約 API

レスポンス:

```json
{
  "data": {
    "greeting": "おかえりなさい",
    "focusedGoal": {
      "id": "goal_xxx",
      "title": "旅行用ノートPC",
      "targetAmount": 40000,
      "currentAmount": 21600,
      "remainingAmount": 18400,
      "achievementRate": 54,
      "remainingDays": 84,
      "score": 1.92,
      "visual": {
        "category": "ITEMS",
        "subcategory": "laptop",
        "theme": "SOFT",
        "step": 3,
        "imagePath": "/goal-assets/soft/items_laptop_3.png",
        "completeImagePath": "/goal-assets/soft/items_laptop_complete.png",
        "altText": "ノートPCの進捗イラスト",
        "headlineText": "新しい相棒を迎える準備をしよう"
      }
    },
    "savingSummary": {
      "currentPeriodId": "2026-02-25",
      "savingTotal": 21600
    },
    "mission": {
      "type": "record_today",
      "message": "今日の記録をつけると、目標にまた近づけます"
    },
    "recentRecords": []
  }
}
```

- ホーム: `GET /api/dashboard`
- 進捗: `GET /api/analysis` + `GET /api/records?periodId=...`

### 12.3 画像アセット解決

フロントは `visual.imagePath` を優先表示し、失敗時は以下へフォールバックする。

1. `completeImagePath` または step 対応画像
2. `other/generic` の同 step 画像
3. `default_generic_complete` または `default_generic_stepX`

テキストは `visual.headlineText` を優先し、未設定時は以下へフォールバックする。

1. 同カテゴリ共通テキスト
2. `目標に向けて少しずつ進んでいます`

## 13. バリデーション優先順位

最優先で厳格にやるべき項目:

- 認証
- 招待トークン
- `userId` 境界
- 口座残高更新
- `periodId`
- `fromAccountId != toAccountId`
- `goalId` と `SAVING` の整合
- カテゴリ種別整合

最終更新：23:04