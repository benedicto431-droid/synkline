from __future__ import annotations

import base64
import json
import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from functools import lru_cache, wraps
from pathlib import Path
from typing import Any, Callable

import jwt
import requests
from flask import Flask, jsonify, request, send_from_directory
from jwt import PyJWKClient
from werkzeug.utils import secure_filename


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / ".data"
DATABASE_PATH = DATA_DIR / "synkline.sqlite3"
UPLOAD_DIR = ROOT / "artifacts" / "synkline-stores" / "public" / "uploads"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES


SEED_PRODUCTS = [
    {
        "id": "synkline-air-14",
        "name": "Air 14 — Everyday Ultrabook",
        "brand": "Synkline Select",
        "category": "Everyday",
        "price": 124999,
        "description": "A light, capable everyday laptop with a vivid display and all-day battery life.",
        "images": ["/images/laptop-silver.jpg", "/images/store-hero.jpg"],
        "specs": {
            "Screen": "14 inch",
            "Processor": "Intel Core Ultra 5",
            "Memory": "16 GB",
            "Storage": "512 GB SSD",
            "Weight": "1.38 kg",
            "Battery": "Up to 14 hours",
        },
        "stock": 8,
        "featured": True,
    },
    {
        "id": "synkline-pro-16",
        "name": "Pro 16 — Creator Edition",
        "brand": "Synkline Select",
        "category": "Creator",
        "price": 219999,
        "description": "A spacious, color-rich display and dedicated graphics for editing, design, and demanding work.",
        "images": ["/images/laptop-graphite.jpg", "/images/store-hero.jpg"],
        "specs": {
            "Screen": "16 inch",
            "Processor": "Intel Core Ultra 7",
            "Memory": "32 GB",
            "Storage": "1 TB SSD",
            "Graphics": "NVIDIA RTX 4060",
            "Weight": "2.05 kg",
        },
        "stock": 4,
        "featured": True,
    },
    {
        "id": "synkline-flex-14",
        "name": "Flex 14 — 2-in-1 Touch",
        "brand": "Synkline Select",
        "category": "2-in-1",
        "price": 149999,
        "description": "A flexible touchscreen laptop that moves easily between focused work, reading, and sketching.",
        "images": ["/images/laptop-navy.jpg", "/images/laptop-silver.jpg"],
        "specs": {
            "Screen": "14 inch touchscreen",
            "Processor": "AMD Ryzen 7",
            "Memory": "16 GB",
            "Storage": "512 GB SSD",
            "Hinge": "360-degree",
            "Weight": "1.52 kg",
        },
        "stock": 6,
        "featured": False,
    },
    {
        "id": "synkline-core-15",
        "name": "Core 15 — Performance",
        "brand": "Synkline Select",
        "category": "Performance",
        "price": 179999,
        "description": "A balanced performance laptop with room for larger projects and comfortable multitasking.",
        "images": ["/images/laptop-graphite.jpg", "/images/laptop-navy.jpg"],
        "specs": {
            "Screen": "15.6 inch",
            "Processor": "AMD Ryzen 7",
            "Memory": "16 GB",
            "Storage": "1 TB SSD",
            "Graphics": "AMD Radeon",
            "Weight": "1.86 kg",
        },
        "stock": 5,
        "featured": False,
    },
]


def get_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    with get_db() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                brand TEXT NOT NULL,
                category TEXT NOT NULL,
                price REAL NOT NULL,
                description TEXT NOT NULL,
                images_json TEXT NOT NULL,
                specs_json TEXT NOT NULL,
                stock INTEGER NOT NULL DEFAULT 0,
                featured INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                reference TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                delivery_address TEXT NOT NULL,
                items_json TEXT NOT NULL,
                total REAL NOT NULL,
                status TEXT NOT NULL,
                payment_status TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        existing = db.execute("SELECT COUNT(*) AS count FROM products").fetchone()["count"]
        if existing == 0:
            for product in SEED_PRODUCTS:
                _insert_product(db, product)


def _product_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "brand": row["brand"],
        "category": row["category"],
        "price": row["price"],
        "description": row["description"],
        "images": json.loads(row["images_json"]),
        "specs": json.loads(row["specs_json"]),
        "stock": row["stock"],
        "featured": bool(row["featured"]),
    }


def _insert_product(db: sqlite3.Connection, product: dict[str, Any]) -> None:
    db.execute(
        """
        INSERT INTO products
        (id, name, brand, category, price, description, images_json, specs_json, stock, featured)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            product["id"],
            product["name"],
            product["brand"],
            product["category"],
            product["price"],
            product["description"],
            json.dumps(product["images"]),
            json.dumps(product["specs"]),
            product["stock"],
            int(product["featured"]),
        ),
    )


def _get_product(product_id: str) -> dict[str, Any] | None:
    with get_db() as db:
        row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        return _product_from_row(row) if row else None


def _clerk_jwks_url() -> str:
    publishable_key = os.environ.get("CLERK_PUBLISHABLE_KEY", "")
    try:
        encoded = publishable_key.split("_", 2)[2]
        padded = encoded + ("=" * (-len(encoded) % 4))
        host = base64.urlsafe_b64decode(padded.encode()).decode().rstrip("$")
        if not host.startswith("clerk."):
            raise ValueError("Unexpected Clerk publishable key host")
        return f"https://{host}/.well-known/jwks.json"
    except (IndexError, ValueError, UnicodeDecodeError):
        raise RuntimeError("Clerk authentication is not configured correctly")


@lru_cache(maxsize=1)
def _jwks_client(url: str) -> PyJWKClient:
    return PyJWKClient(url, cache_keys=True, cache_jwk_set=True)


@lru_cache(maxsize=128)
def _clerk_user_email(user_id: str) -> str | None:
    secret_key = os.environ.get("CLERK_SECRET_KEY")
    if not secret_key:
        return None
    response = requests.get(
        f"https://api.clerk.com/v1/users/{user_id}",
        headers={"Authorization": f"Bearer {secret_key}"},
        timeout=8,
    )
    response.raise_for_status()
    user = response.json()
    primary_id = user.get("primary_email_address_id")
    for address in user.get("email_addresses", []):
        if address.get("id") == primary_id:
            return str(address.get("email_address", "")).lower()
    return None


def _admin_identity() -> tuple[bool, str]:
    configured_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    if not configured_email:
        return False, "Admin access is not configured. Set ADMIN_EMAIL to the store administrator's account email."

    token = request.cookies.get("__session")
    if not token:
        return False, "Sign in with the store administrator account to continue."

    try:
        signing_key = _jwks_client(_clerk_jwks_url()).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        user_id = str(claims.get("sub", ""))
        if not user_id:
            return False, "Your sign-in session could not be verified."
        email = _clerk_user_email(user_id)
        if not email or email != configured_email:
            return False, "This account does not have store administrator access."
        return True, ""
    except (jwt.PyJWTError, requests.RequestException, RuntimeError, ValueError):
        return False, "Your sign-in session could not be verified. Please sign in again."


def require_admin(handler: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(handler)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        allowed, message = _admin_identity()
        if allowed:
            return handler(*args, **kwargs)
        status = 503 if not os.environ.get("ADMIN_EMAIL", "").strip() else 401
        if "does not have" in message:
            status = 403
        return jsonify({"error": message}), status

    return wrapped


def _validate_product_payload(payload: Any) -> tuple[dict[str, Any] | None, str | None]:
    if not isinstance(payload, dict):
        return None, "Product data must be an object."
    required = ("name", "brand", "category", "price", "description", "images", "specs", "stock", "featured")
    if any(field not in payload for field in required):
        return None, "Please complete every product field."
    try:
        price = float(payload["price"])
        stock = int(payload["stock"])
    except (TypeError, ValueError):
        return None, "Price and stock must be valid numbers."
    if price < 0 or stock < 0:
        return None, "Price and stock cannot be negative."
    images = payload["images"]
    specs = payload["specs"]
    if not isinstance(images, list) or not all(isinstance(item, str) for item in images):
        return None, "Product images must be a list of image URLs."
    if len(images) > 12:
        return None, "Add no more than 12 product images."
    if not isinstance(specs, dict) or not all(
        isinstance(key, str) and isinstance(value, str) for key, value in specs.items()
    ):
        return None, "Product specifications must be text labels and values."
    for image in images:
        if not (image.startswith("https://") or image.startswith("/images/") or image.startswith("/uploads/")):
            return None, "Images must use HTTPS or a Synkline upload path."
    clean = {
        "name": str(payload["name"]).strip()[:120],
        "brand": str(payload["brand"]).strip()[:80],
        "category": str(payload["category"]).strip()[:50],
        "price": price,
        "description": str(payload["description"]).strip()[:1200],
        "images": images,
        "specs": {str(key)[:60]: str(value)[:160] for key, value in specs.items()},
        "stock": stock,
        "featured": bool(payload["featured"]),
    }
    if not clean["name"] or not clean["brand"]:
        return None, "Product name and brand are required."
    return clean, None


@app.get("/api/healthz")
def health_check() -> Any:
    return jsonify({"status": "ok"})


@app.get("/api/products")
def list_products() -> Any:
    search = request.args.get("search", "").strip().lower()
    category = request.args.get("category", "").strip().lower()
    with get_db() as db:
        rows = db.execute("SELECT * FROM products ORDER BY featured DESC, name ASC").fetchall()
    products = [_product_from_row(row) for row in rows]
    if search:
        products = [
            product
            for product in products
            if search in " ".join(
                [
                    product["name"],
                    product["brand"],
                    product["category"],
                    product["description"],
                    *product["specs"].values(),
                ]
            ).lower()
        ]
    if category:
        products = [product for product in products if product["category"].lower() == category]
    return jsonify(products)


@app.get("/api/products/<product_id>")
def get_product(product_id: str) -> Any:
    product = _get_product(product_id)
    if not product:
        return jsonify({"error": "Laptop not found."}), 404
    return jsonify(product)


@app.get("/api/products/<product_id>/similar")
def similar_products(product_id: str) -> Any:
    selected = _get_product(product_id)
    if not selected:
        return jsonify({"error": "Laptop not found."}), 404
    with get_db() as db:
        rows = db.execute("SELECT * FROM products WHERE id != ?", (product_id,)).fetchall()
    candidates = [_product_from_row(row) for row in rows]

    def screen_size(product: dict[str, Any]) -> float:
        value = product["specs"].get("Screen", "")
        match = re.search(r"(\d+(?:\.\d+)?)", value)
        return float(match.group(1)) if match else 0

    def score(candidate: dict[str, Any]) -> float:
        price_delta = abs(candidate["price"] - selected["price"]) / max(selected["price"], 1)
        size_delta = abs(screen_size(candidate) - screen_size(selected))
        category_bonus = 0.35 if candidate["category"] == selected["category"] else 0
        return category_bonus - price_delta - (size_delta * 0.08)

    candidates.sort(key=score, reverse=True)
    return jsonify(candidates[:3])


@app.post("/api/orders")
def create_guest_order() -> Any:
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    phone = str(payload.get("phone", "")).strip()
    address = str(payload.get("deliveryAddress", "")).strip()
    items = payload.get("items")
    if not name or not phone or not address or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify({"error": "Enter a name, valid email, phone number, and delivery address."}), 400
    if not isinstance(items, list) or not items:
        return jsonify({"error": "Your cart is empty."}), 400

    order_items: list[dict[str, Any]] = []
    total = 0.0
    order_id = str(uuid.uuid4())
    reference = f"SK-{uuid.uuid4().hex[:8].upper()}"
    with get_db() as db:
        try:
            db.execute("BEGIN IMMEDIATE")
            for item in items:
                product_id = str(item.get("productId", ""))
                try:
                    quantity = int(item.get("quantity", 0))
                except (TypeError, ValueError):
                    return jsonify({"error": "Product quantities must be whole numbers."}), 400
                row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
                if not row or quantity < 1:
                    return jsonify({"error": "A cart item is no longer available."}), 400
                product = _product_from_row(row)
                if quantity > product["stock"]:
                    return jsonify({"error": f"Only {product['stock']} units of {product['name']} are available."}), 409
                order_items.append({"productId": product_id, "quantity": quantity})
                total += product["price"] * quantity
                db.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (quantity, product_id))
            db.execute(
                """
                INSERT INTO orders
                (id, reference, name, email, phone, delivery_address, items_json, total, status, payment_status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    order_id,
                    reference,
                    name,
                    email,
                    phone,
                    address,
                    json.dumps(order_items),
                    round(total, 2),
                    "received",
                    "unpaid",
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            db.commit()
        except sqlite3.Error:
            db.rollback()
            app.logger.exception("Unable to record guest order")
            return jsonify({"error": "The order could not be saved. Please try again."}), 500

    return (
        jsonify(
            {
                "id": order_id,
                "reference": reference,
                "name": name,
                "email": email,
                "phone": phone,
                "deliveryAddress": address,
                "items": order_items,
                "total": round(total, 2),
                "status": "received",
                "paymentStatus": "unpaid",
            }
        ),
        201,
    )


@app.post("/api/assistant/chat")
def chat_about_product() -> Any:
    payload = request.get_json(silent=True) or {}
    product_id = str(payload.get("productId", ""))
    message = str(payload.get("message", "")).strip()
    if not message:
        return jsonify({"error": "Ask a question about this laptop."}), 400
    product = _get_product(product_id)
    if not product:
        return jsonify({"error": "Laptop not found."}), 404
    api_key = os.environ.get("COHERE_API_KEY")
    if not api_key:
        return jsonify({"error": "Cohere chat is not connected yet. Add COHERE_API_KEY in project secrets to enable it."}), 503

    system_message = (
        "You are Synkline Stores' laptop specialist. Answer questions about the selected laptop using only "
        "the product details supplied below. Be concise and practical. If the details do not answer a question, "
        "say so instead of guessing. Do not claim a price or stock status that differs from the supplied data. "
        f"Selected laptop: {product['name']} by {product['brand']}. Price: KES {product['price']:,.0f}. "
        f"Description: {product['description']}. Specifications: {json.dumps(product['specs'], ensure_ascii=False)}."
    )
    try:
        response = requests.post(
            "https://api.cohere.com/v2/chat",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "command-a-03-2025",
                "messages": [
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": message},
                ],
            },
            timeout=30,
        )
        response.raise_for_status()
        result = response.json()
        content = result.get("message", {}).get("content", [])
        reply = " ".join(
            part.get("text", "") for part in content if isinstance(part, dict) and part.get("type") == "text"
        ).strip()
        if not reply:
            raise ValueError("Cohere returned no text")
        return jsonify({"reply": reply})
    except (requests.RequestException, ValueError):
        app.logger.exception("Cohere product chat request failed")
        return jsonify({"error": "Cohere could not answer right now. Please try again."}), 502


@app.get("/api/admin/products")
@require_admin
def admin_list_products() -> Any:
    with get_db() as db:
        rows = db.execute("SELECT * FROM products ORDER BY name").fetchall()
    return jsonify([_product_from_row(row) for row in rows])


@app.post("/api/admin/products")
@require_admin
def admin_create_product() -> Any:
    product, error = _validate_product_payload(request.get_json(silent=True))
    if error or product is None:
        return jsonify({"error": error or "Invalid product data."}), 400
    product["id"] = str(uuid.uuid4())
    with get_db() as db:
        _insert_product(db, product)
    return jsonify(product), 201


@app.patch("/api/admin/products/<product_id>")
@require_admin
def admin_update_product(product_id: str) -> Any:
    product, error = _validate_product_payload(request.get_json(silent=True))
    if error or product is None:
        return jsonify({"error": error or "Invalid product data."}), 400
    with get_db() as db:
        exists = db.execute("SELECT 1 FROM products WHERE id = ?", (product_id,)).fetchone()
        if not exists:
            return jsonify({"error": "Laptop not found."}), 404
        product["id"] = product_id
        db.execute(
            """
            UPDATE products SET name=?, brand=?, category=?, price=?, description=?,
              images_json=?, specs_json=?, stock=?, featured=? WHERE id=?
            """,
            (
                product["name"],
                product["brand"],
                product["category"],
                product["price"],
                product["description"],
                json.dumps(product["images"]),
                json.dumps(product["specs"]),
                product["stock"],
                int(product["featured"]),
                product_id,
            ),
        )
    return jsonify(product)


@app.delete("/api/admin/products/<product_id>")
@require_admin
def admin_delete_product(product_id: str) -> Any:
    with get_db() as db:
        result = db.execute("DELETE FROM products WHERE id = ?", (product_id,))
        if result.rowcount == 0:
            return jsonify({"error": "Laptop not found."}), 404
    return "", 204


@app.get("/api/admin/orders")
@require_admin
def admin_list_orders() -> Any:
    with get_db() as db:
        rows = db.execute("SELECT * FROM orders ORDER BY created_at DESC").fetchall()
    return jsonify(
        [
            {
                "id": row["id"],
                "reference": row["reference"],
                "name": row["name"],
                "email": row["email"],
                "phone": row["phone"],
                "deliveryAddress": row["delivery_address"],
                "items": json.loads(row["items_json"]),
                "total": row["total"],
                "status": row["status"],
                "paymentStatus": row["payment_status"],
            }
            for row in rows
        ]
    )


@app.post("/api/admin/images")
@require_admin
def admin_upload_image() -> Any:
    image = request.files.get("image")
    if not image or not image.filename:
        return jsonify({"error": "Choose an image to upload."}), 400
    filename = secure_filename(image.filename)
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({"error": "Upload a JPG, PNG, or WebP image."}), 400
    if image.mimetype not in {"image/jpeg", "image/png", "image/webp"}:
        return jsonify({"error": "The selected file is not a supported image."}), 400
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    saved_name = f"{uuid.uuid4().hex}{extension}"
    image.save(UPLOAD_DIR / saved_name)
    return jsonify({"url": f"/uploads/{saved_name}"}), 201


@app.get("/uploads/<path:filename>")
def uploaded_image(filename: str) -> Any:
    return send_from_directory(UPLOAD_DIR, filename)


initialize_database()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    app.run(host="0.0.0.0", port=port, debug=False)
