from main import price_on


def test_demo_price_schedule():
    assert price_on("RJ-140", 0) == 140.00
    assert price_on("RJ-140", 2) == 140.00
    assert price_on("RJ-140", 3) == 110.00
    assert price_on("RJ-140", 19) == 110.00
    assert price_on("RJ-140", 20) == 95.00
    assert price_on("RJ-140", 28) == 95.00


def test_seeded_stores_price_schedule():
    # Negative days are before the demo's day 0.
    assert price_on("FP-TENT-249", -9) == 249.00
    assert price_on("FP-TENT-249", 0) == 219.00
    assert price_on("FP-TENT-249", 8) == 199.00
    assert price_on("FP-FLEECE-89", 10) == 59.00
    assert price_on("HS-DUVET-89", 28) == 89.00
