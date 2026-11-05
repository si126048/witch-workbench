testsuite nightfall:
    teardown:
        exit

    testcase opening:
        run Start()
        advance until "雨停之前，这条街不会出现在地图上。" timeout 30.0
        pause 1.0
        assert not screen "main_menu"
        assert screen "say"
        assert eval renpy.showing("nf_opening_traveler")
        assert eval renpy.music.get_playing("music") == "audio/nightfall_rain.wav"
        screenshot "nightfall_first_dialogue.png"
        advance until "远处的钟声响起。路灯下，影子迟了一步。" timeout 30.0
        assert eval renpy.music.get_playing("sound") == "audio/nightfall_bell.wav"
        pause 0.5
        screenshot "nightfall_second_dialogue.png"
