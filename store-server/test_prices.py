from main import price_on


def test_demo_price_schedule():
    assert price_on("RJ-140", 0) == 140.00
    assert price_on("RJ-140", 2) == 140.00
    assert price_on("RJ-140", 3) == 110.00
    assert price_on("RJ-140", 19) == 110.00
    assert price_on("RJ-140", 20) == 95.00
    assert price_on("RJ-140", 28) == 95.00
